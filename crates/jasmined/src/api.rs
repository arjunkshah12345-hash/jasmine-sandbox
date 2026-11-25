use crate::manager::{CreateOpts, Manager};
use axum::body::Bytes;
use axum::extract::{DefaultBodyLimit, Path, Query, Request, State};
use axum::http::{header, StatusCode};
use axum::middleware::{self, Next};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::Deserialize;
use serde_json::json;
use std::collections::BTreeMap;
use std::sync::Arc;
use std::time::Instant;
use jasmine_proto::ExecRequest;

#[derive(Clone)]
struct AppState {
    mgr: Arc<Manager>,
    api_key: Option<String>,
}

struct ApiError(StatusCode, String);

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (self.0, Json(json!({ "error": self.1 }))).into_response()
    }
}

impl From<anyhow::Error> for ApiError {
    fn from(e: anyhow::Error) -> Self {
        ApiError(StatusCode::INTERNAL_SERVER_ERROR, format!("{e:#}"))
    }
}

type ApiResult<T> = Result<T, ApiError>;

fn not_found() -> ApiError {
    ApiError(StatusCode::NOT_FOUND, "sandbox not found".into())
}

pub fn router(mgr: Arc<Manager>, api_key: Option<String>) -> Router {
    let state = AppState { mgr, api_key };
    Router::new()
        .route("/v1/templates", get(list_templates).post(build_template))
        .route("/v1/sandboxes", get(list_sandboxes).post(create_sandbox))
        .route("/v1/sandboxes/{id}", get(get_sandbox).delete(delete_sandbox))
        .route("/v1/templates/{name}", get(get_template).delete(delete_template))
        .route("/v1/sandboxes/{id}/exec", post(exec))
        .route("/v1/sandboxes/{id}/pause", post(pause))
        .route("/v1/sandboxes/{id}/resume", post(resume))
        .route("/v1/sandboxes/{id}/snapshot", post(snapshot))
        .route("/v1/sandboxes/{id}/ports/{port}", axum::routing::any(preview_root))
        .route("/v1/sandboxes/{id}/ports/{port}/", axum::routing::any(preview_root))
        .route("/v1/sandboxes/{id}/ports/{port}/{*rest}", axum::routing::any(preview))
        .route("/v1/sandboxes/{id}/files", get(read_file).put(write_file))
        .layer(middleware::from_fn_with_state(state.clone(), auth))
        .route("/healthz", get(|| async { "ok" }))
        .layer(DefaultBodyLimit::max(1 << 30))
        .with_state(state)
}

async fn auth(State(st): State<AppState>, req: Request, next: Next) -> Response {
    if let Some(key) = &st.api_key {
        let ok = req
            .headers()
            .get(header::AUTHORIZATION)
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.strip_prefix("Bearer "))
            .is_some_and(|t| constant_time_eq(t.as_bytes(), key.as_bytes()));
        if !ok {
            return ApiError(StatusCode::UNAUTHORIZED, "missing or invalid API key".into()).into_response();
        }
    }
    next.run(req).await
}

fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    a.len() == b.len() && a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

#[derive(Deserialize)]
struct BuildTemplate {
    name: String,
    image: String,
    #[serde(default = "default_vcpus")]
    vcpus: u32,
    #[serde(default = "default_mem")]
    mem_mib: u32,
    #[serde(default = "default_prewarm")]
    prewarm_mib: u32,
    #[serde(flatten)]
    opts: crate::manager::BuildOpts,
}
fn default_prewarm() -> u32 {
    256
}
fn default_vcpus() -> u32 {
    2
}
fn default_mem() -> u32 {
    1024
}

async fn list_templates(State(st): State<AppState>) -> impl IntoResponse {
    Json(st.mgr.templates())
}

async fn build_template(State(st): State<AppState>, Json(b): Json<BuildTemplate>) -> ApiResult<impl IntoResponse> {
    let meta = st.mgr.build_template(&b.name, &b.image, b.vcpus, b.mem_mib, b.prewarm_mib, b.opts).await?;
    Ok((StatusCode::CREATED, Json(meta)))
}

#[derive(Deserialize)]
struct CreateSandbox {
    #[serde(default = "default_template")]
    template: String,
    #[serde(flatten)]
    opts: CreateOpts,
}
fn default_template() -> String {
    "default".into()
}

async fn create_sandbox(State(st): State<AppState>, body: Option<Json<CreateSandbox>>) -> ApiResult<impl IntoResponse> {
    let (template, opts) = body.map(|b| (b.0.template, b.0.opts)).unwrap_or_else(|| (default_template(), CreateOpts::default()));
    let (sbx, timings) = st.mgr.create(&template, opts).await.map_err(|e| {
        let msg = format!("{e:#}");
        tracing::warn!("create failed: {msg}");
        if msg.contains("not found") || msg.contains("no template") {
            ApiError(StatusCode::NOT_FOUND, msg)
        } else if msg.contains("already exists") {
            ApiError(StatusCode::CONFLICT, msg)
        } else {
            ApiError(StatusCode::INTERNAL_SERVER_ERROR, msg)
        }
    })?;
    let mut v = serde_json::to_value(sbx.info()).unwrap();
    v["timings"] = serde_json::to_value(timings).unwrap();
    Ok((StatusCode::CREATED, Json(v)))
}

/// `GET /v1/sandboxes?key=K&label.team=x&label.run=y`
async fn list_sandboxes(State(st): State<AppState>, Query(q): Query<Vec<(String, String)>>) -> impl IntoResponse {
    let labels: BTreeMap<String, String> =
        q.iter().filter_map(|(k, v)| k.strip_prefix("label.").map(|k| (k.to_string(), v.clone()))).collect();
    let key = q.iter().find(|(k, _)| k == "key").map(|(_, v)| v.as_str());
    let mut out = Vec::new();
    for info in st.mgr.list(&labels, key).await {
        let mut v = serde_json::to_value(&info).unwrap();
        if let Some(s) = st.mgr.get(&info.id).await {
            v["state"] = json!(if st.mgr.is_paused(&s).await { "paused" } else { "running" });
        }
        out.push(v);
    }
    Json(out)
}

async fn get_sandbox(State(st): State<AppState>, Path(id): Path<String>) -> ApiResult<impl IntoResponse> {
    let sbx = st.mgr.get(&id).await.ok_or_else(not_found)?;
    let mut v = serde_json::to_value(sbx.info()).unwrap();
    v["state"] = json!(if st.mgr.is_paused(&sbx).await { "paused" } else { "running" });
    Ok(Json(v))
}

async fn pause(State(st): State<AppState>, Path(id): Path<String>) -> ApiResult<StatusCode> {
    st.mgr.get(&id).await.ok_or_else(not_found)?;
    st.mgr.pause(&id).await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn resume(State(st): State<AppState>, Path(id): Path<String>) -> ApiResult<impl IntoResponse> {
    st.mgr.get(&id).await.ok_or_else(not_found)?;
    let t = st.mgr.resume(&id).await?;
    Ok(Json(json!({ "resumed": t.is_some(), "timings": t })))
}

async fn snapshot(State(st): State<AppState>, Path(id): Path<String>) -> ApiResult<impl IntoResponse> {
    st.mgr.get(&id).await.ok_or_else(not_found)?;
    Ok((StatusCode::CREATED, Json(st.mgr.snapshot(&id).await?)))
}

async fn get_template(State(st): State<AppState>, Path(name): Path<String>) -> ApiResult<impl IntoResponse> {
    st.mgr.template(&name).map(Json).ok_or_else(|| ApiError(StatusCode::NOT_FOUND, "template not found".into()))
}

async fn delete_template(State(st): State<AppState>, Path(name): Path<String>) -> ApiResult<StatusCode> {
    if st.mgr.delete_template(&name).await? {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(ApiError(StatusCode::NOT_FOUND, "template not found".into()))
    }
}

async fn delete_sandbox(State(st): State<AppState>, Path(id): Path<String>) -> ApiResult<StatusCode> {
    if st.mgr.delete(&id).await {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(not_found())
    }
}

#[derive(Deserialize)]
#[serde(untagged)]
enum Cmd {
    Shell(String),
    Argv(Vec<String>),
}

#[derive(Deserialize)]
struct Exec {
    cmd: Cmd,
    #[serde(default)]
    env: BTreeMap<String, String>,
    cwd: Option<String>,
    timeout_ms: Option<u64>,
    stdin: Option<String>,
}

async fn exec(State(st): State<AppState>, Path(id): Path<String>, Json(e): Json<Exec>) -> ApiResult<impl IntoResponse> {
    let sbx = st.mgr.get(&id).await.ok_or_else(not_found)?;
    let argv = match e.cmd {
        Cmd::Shell(s) => vec!["/bin/sh".into(), "-c".into(), s],
        Cmd::Argv(a) => a,
    };
    st.mgr.ensure_running(&sbx).await?;
    let mut env = sbx.env.clone();
    env.extend(e.env);
    let t = Instant::now();
    let out = sbx
        .agent
        .exec(ExecRequest { argv, env, cwd: e.cwd, timeout_ms: e.timeout_ms, stdin: false }, e.stdin.map(String::into_bytes))
        .await?;
    let mut v = serde_json::to_value(out).unwrap();
    v["duration_ms"] = json!((t.elapsed().as_secs_f64() * 1e6).round() / 1e3);
    Ok(Json(v))
}

#[derive(Deserialize)]
struct FileQuery {
    path: String,
    mode: Option<String>,
}

async fn read_file(State(st): State<AppState>, Path(id): Path<String>, Query(q): Query<FileQuery>) -> ApiResult<impl IntoResponse> {
    let sbx = st.mgr.get(&id).await.ok_or_else(not_found)?;
    st.mgr.ensure_running(&sbx).await?;
    let data = sbx.agent.read_file(&q.path).await.map_err(|e| ApiError(StatusCode::NOT_FOUND, format!("{e:#}")))?;
    Ok(([(header::CONTENT_TYPE, "application/octet-stream")], data))
}

async fn write_file(State(st): State<AppState>, Path(id): Path<String>, Query(q): Query<FileQuery>, body: Bytes) -> ApiResult<StatusCode> {
    let sbx = st.mgr.get(&id).await.ok_or_else(not_found)?;
    let mode = match q.mode.as_deref() {
        Some(m) => u32::from_str_radix(m, 8).map_err(|_| ApiError(StatusCode::BAD_REQUEST, "mode must be octal".into()))?,
        None => 0o644,
    };
    st.mgr.ensure_running(&sbx).await?;
    sbx.agent.write_file(&q.path, mode, &body).await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn preview_root(st: State<AppState>, Path((id, port)): Path<(String, u16)>, req: Request) -> Response {
    proxy(st, id, port, String::new(), req).await
}

async fn preview(st: State<AppState>, Path((id, port, rest)): Path<(String, u16, String)>, req: Request) -> Response {
    proxy(st, id, port, rest, req).await
}

/// Reverse-proxy HTTP to `127.0.0.1:<port>` inside the sandbox, over vsock.
/// The guest sees `Host: localhost:<port>`, so dev servers with host checks
/// (Vite, Next) and Chrome's DevTools endpoint accept it without configuration.
/// WebSocket upgrades are passed through, so CDP (driving a browser in the
/// sandbox) and dev-server hot reload work over the same URL.
async fn proxy(State(st): State<AppState>, id: String, port: u16, rest: String, req: Request) -> Response {
    let result: Result<Response, ApiError> = async {
        let sbx = st.mgr.get(&id).await.ok_or_else(not_found)?;
        st.mgr.ensure_running(&sbx).await?;
        let stream = sbx
            .agent
            .connect_port(port)
            .await
            .map_err(|e| ApiError(StatusCode::BAD_GATEWAY, format!("nothing listening on port {port}: {e:#}")))?;
        let (mut parts, body) = req.into_parts();
        let upgrade = parts.headers.contains_key(header::UPGRADE);
        let client_upgrade = if upgrade { parts.extensions.remove::<hyper::upgrade::OnUpgrade>() } else { None };
        let path = format!("/{rest}{}", parts.uri.query().map(|q| format!("?{q}")).unwrap_or_default());
        parts.uri = path.parse().map_err(|_| ApiError(StatusCode::BAD_REQUEST, "bad path".into()))?;
        parts.headers.remove(header::AUTHORIZATION);
        // Hop-by-hop headers stay on this hop, except the pair that asks for an upgrade.
        for h in ["keep-alive", "proxy-connection", "transfer-encoding", "te", "trailer"] {
            parts.headers.remove(h);
        }
        if !upgrade {
            parts.headers.remove(header::CONNECTION);
        }
        parts.headers.insert(header::HOST, format!("localhost:{port}").parse().unwrap());
        let (mut sender, conn) = hyper::client::conn::http1::handshake(hyper_util::rt::TokioIo::new(stream))
            .await
            .map_err(|e| ApiError(StatusCode::BAD_GATEWAY, format!("handshake: {e}")))?;
        tokio::spawn(async move {
            let _ = conn.with_upgrades().await;
        });
        let mut res = sender
            .send_request(axum::http::Request::from_parts(parts, body))
            .await
            .map_err(|e| ApiError(StatusCode::BAD_GATEWAY, format!("upstream: {e}")))?;
        if res.status() == StatusCode::SWITCHING_PROTOCOLS {
            let client_upgrade = client_upgrade
                .ok_or_else(|| ApiError(StatusCode::BAD_GATEWAY, "upstream switched protocols unasked".into()))?;
            let upstream = hyper::upgrade::on(&mut res);
            tokio::spawn(async move {
                let (Ok(up), Ok(down)) = (upstream.await, client_upgrade.await) else { return };
                let (mut up, mut down) = (hyper_util::rt::TokioIo::new(up), hyper_util::rt::TokioIo::new(down));
                let _ = tokio::io::copy_bidirectional(&mut up, &mut down).await;
            });
        }
        Ok(res.map(axum::body::Body::new))
    }
    .await;
    result.unwrap_or_else(|e| e.into_response())
}
