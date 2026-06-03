import { TemperatureProvider } from './temperatureProvider';

type WsStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

type BridgeFrame = {
  bt: number | null;
  et: number | null;
  t: number;
  ror: number | null;
};

type StatusCallback = (status: WsStatus) => void;

const RECONNECT_DELAY_MS = 3000;

/**
 * Phase 3 provider — reads live temperature from the Artisan WebSocket bridge.
 *
 * Connect by calling connect(url). The provider keeps the connection alive with
 * automatic reconnect. Call disconnect() to stop (e.g. when leaving the roast
 * screen or when the user clears the bridge IP).
 *
 * Falls back gracefully: getBT/getET/getRoR return null when disconnected,
 * so the engine stays in manual mode until live data arrives.
 */
export class ArtisanProvider implements TemperatureProvider {
  private bt: number | null = null;
  private et: number | null = null;
  private ror: number | null = null;

  private ws: WebSocket | null = null;
  private url: string | null = null;
  private active = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private onStatus: StatusCallback;

  constructor(onStatus: StatusCallback) {
    this.onStatus = onStatus;
  }

  getBT(): number | null { return this.bt; }
  getET(): number | null { return this.et; }
  getRoR(): number | null { return this.ror; }

  connect(ip: string): void {
    this.disconnect();
    this.url = `ws://${ip}:8765/`;
    this.active = true;
    this._open();
  }

  disconnect(): void {
    this.active = false;
    this._clearReconnect();
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
    this.bt = null;
    this.et = null;
    this.ror = null;
    this.onStatus('disconnected');
  }

  private _open(): void {
    if (!this.url || !this.active) return;
    this.onStatus('connecting');

    const ws = new WebSocket(this.url);
    this.ws = ws;

    ws.onopen = () => {
      if (ws !== this.ws) return;
      this.onStatus('connected');
    };

    ws.onmessage = (event) => {
      if (ws !== this.ws) return;
      try {
        const frame: BridgeFrame = JSON.parse(event.data as string);
        this.bt  = typeof frame.bt  === 'number' ? frame.bt  : null;
        this.et  = typeof frame.et  === 'number' ? frame.et  : null;
        this.ror = typeof frame.ror === 'number' ? frame.ror : null;
      } catch {
        // malformed frame — keep last known values
      }
    };

    ws.onerror = () => {
      if (ws !== this.ws) return;
      this.onStatus('error');
    };

    ws.onclose = () => {
      if (ws !== this.ws) return;
      this.bt = null;
      this.et = null;
      this.ror = null;
      if (this.active) {
        this.onStatus('connecting');
        this._scheduleReconnect();
      } else {
        this.onStatus('disconnected');
      }
    };
  }

  private _scheduleReconnect(): void {
    this._clearReconnect();
    this.reconnectTimer = setTimeout(() => {
      this._open();
    }, RECONNECT_DELAY_MS);
  }

  private _clearReconnect(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
