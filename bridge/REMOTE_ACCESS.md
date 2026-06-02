# Bridge — Remote Access & Tunnelling

By default the bridge is reachable only on the local Wi-Fi (`ws://<laptop-ip>:8765`).
That is the simplest, most private setup and is recommended when the iPhone and
the roasting laptop are on the same network.

You need a tunnel only when you want one (or more) of:

- **Off-LAN access** — monitor a roast from a phone that isn't on the roastery Wi-Fi.
- **A stable address** — stop re-typing the laptop's local IP when DHCP changes it.
- **TLS (`wss://`)** — see the iOS note below; this is a real unlock, not a nicety.

> **Tradeoff to be aware of:** a *public* tunnel (Cloudflare, ngrok) introduces a
> third-party relay between the laptop and the phone — the "server in the middle"
> we set out to avoid. **Tailscale** is the exception: it's a private WireGuard
> mesh (peer-to-peer; the coordination server only helps with NAT traversal), so
> nothing of your roast data transits a public relay.

## The iOS unlock: TLS removes the App Transport Security block

iOS blocks cleartext `ws://` connections by default (App Transport Security), and
iOS 14+ adds a Local Network permission prompt for LAN IPs. A tunnel that gives
you `wss://` with a real certificate (Cloudflare, ngrok, Tailscale Funnel/Serve)
sidesteps both — the app connects to a normal HTTPS hostname and no
`Info.plist` ATS exception or custom build is required for that part.

---

## Authentication is already built in

Whatever tunnel you choose, set a shared secret so only your app can read the feed:

```bash
# on the laptop, before starting the bridge
export BRIDGE_TOKEN="a-long-random-secret"
python bridge.py
```

The app then connects with the token as a query parameter:

```
wss://<public-host>/?token=a-long-random-secret
```

The bridge rejects any connection whose token doesn't match (closes with code
`4001`). Generate a strong value, e.g. `openssl rand -hex 24`.

> **Security caveat for *public* tunnels:** the token currently travels in the URL
> query string. Over `wss://` it is encrypted in transit, but tunnel dashboards
> (Cloudflare/ngrok) may log request paths. For a publicly-reachable endpoint,
> prefer a long random secret and, ideally, move the token into the
> `Sec-WebSocket-Protocol` header or a first-message handshake (small bridge
> change — see DEVELOPER.md). On a private Tailscale mesh this matters far less.

---

## Options at a glance

| Option | Free | Public exposure | Stable address | TLS (`wss://`) | Best for |
|---|---|---|---|---|---|
| **LAN only** (default) | — | None | No (DHCP IP) | No | Same-Wi-Fi roasting |
| **Tailscale Serve** | Yes | None (tailnet only) | Yes (`*.ts.net`) | Yes | Private cross-network access |
| **Tailscale Funnel** | Yes | Yes | **Yes** (`*.ts.net`) | **Yes (auto)** | Stable public URL + TLS ← recommended for remote |
| **Cloudflare Tunnel** | Yes (no acct) | Yes | Only with named tunnel | Yes | Quick zero-config public URL |
| **ngrok** | Yes | Yes | Only on paid | Yes | Quick public URL (random on free) |
| localtunnel / bore | Yes | Yes | No | localtunnel only | Throwaway testing |

---

## Recommended: Tailscale Funnel (consistent public address + automatic TLS)

Funnel exposes a single local port to the public internet at a **stable** URL of
the form `https://<machine-name>.<tailnet-name>.ts.net`, with TLS certificates
provisioned and renewed automatically. The hostname stays the same across
restarts as long as you don't rename the device, so the app's configured URL
never has to change.

### One-time setup

1. **Install Tailscale** on the roasting laptop and sign in (free personal plan
   is sufficient): https://tailscale.com/download
2. In the **admin console** (https://login.tailscale.com/admin):
   - Enable **MagicDNS**.
   - Enable **HTTPS certificates**.
   - Enable the **Funnel** node attribute for the laptop (Settings → Funnel, or
     add it to the tailnet policy file). The first `funnel` command also prints a
     link to approve this.

Requires Tailscale v1.38.3 or newer.

### Run

Funnel may only listen on ports **443**, **8443**, or **10000**, and proxies to
your local service. Point it at the bridge's port 8765:

```bash
# starts the bridge (with the shared secret) ...
export BRIDGE_TOKEN="a-long-random-secret"
python bridge.py

# ... then, in another terminal, publish port 8765 over Funnel:
tailscale funnel 8765
```

Tailscale prints the public URL, e.g.:

```
https://roast-laptop.tail1234.ts.net/
```

WebSocket upgrades are proxied transparently, so the app connects to:

```
wss://roast-laptop.tail1234.ts.net/?token=a-long-random-secret
```

Run it in the background with `tailscale funnel --bg 8765`. Stop publishing with
`tailscale funnel off` (or `tailscale funnel --bg off`). Turning Funnel off
returns the laptop to LAN-only — the bridge itself is unchanged.

### Want private (tailnet-only) instead of public?

Use **Serve** rather than **Funnel**. Same idea, same `*.ts.net` TLS hostname,
but only devices signed into *your* tailnet can reach it — no public exposure:

```bash
tailscale serve 8765
```

The phone must also have Tailscale installed and be signed into the same tailnet.
This is the most private remote option and keeps the "no public server in the
middle" property.

---

## Quick alternative: Cloudflare Tunnel (zero account)

For a throwaway public URL with TLS and no sign-up:

```bash
cloudflared tunnel --url http://localhost:8765
```

It prints a `https://<random>.trycloudflare.com` URL (changes each run). The app
connects to `wss://<random>.trycloudflare.com/?token=...`. For a *stable*
Cloudflare address you need a free Cloudflare account + a domain and a named
tunnel — at which point Tailscale Funnel is usually simpler.

---

## Summary

- Same Wi-Fi → use the LAN address, no tunnel.
- Remote + want it simple, stable, and TLS-secured → **Tailscale Funnel**.
- Remote but keep it fully private → **Tailscale Serve**.
- One-off demo → **Cloudflare Tunnel**.
- Always set `BRIDGE_TOKEN`; treat it as the only wall when the endpoint is public.

Sources: [Tailscale Funnel docs](https://tailscale.com/docs/features/tailscale-funnel),
[`tailscale funnel` CLI](https://tailscale.com/docs/reference/tailscale-cli/funnel),
[`tailscale serve` CLI](https://tailscale.com/docs/reference/tailscale-cli/serve).
