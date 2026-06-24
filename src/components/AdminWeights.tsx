import { useEffect, useState } from 'react';
import { getActiveConfig, isConfigured, saveConfig } from '../lib/queries';
import type { EnsembleConfigRow } from '../lib/types';

const pct = (x: number) => `${(x * 100).toFixed(0)}%`;

export default function AdminWeights() {
  const [cfg, setCfg] = useState<EnsembleConfigRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    getActiveConfig().then(setCfg);
  }, []);

  if (!cfg) return <p className="text-sm text-terminal-muted">Cargando configuración…</p>;

  // Pesos normalizados para mostrar el reparto efectivo.
  const sum = cfg.poisson_weight + cfg.elo_weight + cfg.context_weight || 1;
  const norm = {
    poisson: cfg.poisson_weight / sum,
    elo: cfg.elo_weight / sum,
    context: cfg.context_weight / sum,
  };

  const set = (k: keyof EnsembleConfigRow, v: number) => setCfg({ ...cfg, [k]: v });

  const onSave = async () => {
    setSaving(true);
    setMsg(null);
    try {
      await saveConfig({
        id: cfg.id,
        poisson_weight: cfg.poisson_weight,
        elo_weight: cfg.elo_weight,
        context_weight: cfg.context_weight,
        value_threshold: cfg.value_threshold,
        elo_home_adv: cfg.elo_home_adv,
      });
      setMsg('Guardado.');
    } catch (e) {
      setMsg(String((e as Error)?.message ?? e));
    } finally {
      setSaving(false);
    }
  };

  const Slider = ({ k, label }: { k: keyof EnsembleConfigRow; label: string }) => (
    <div>
      <div className="flex justify-between text-sm">
        <span className="text-terminal-muted">{label}</span>
        <span className="tabular">{Number(cfg[k]).toFixed(2)}</span>
      </div>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={Number(cfg[k])}
        onChange={(e) => set(k, Number(e.target.value))}
        className="mt-1 w-full accent-signal-info"
      />
    </div>
  );

  return (
    <div className="panel space-y-4 p-4">
      <div className="flex items-center justify-between">
        <span className="label">Pesos del ensemble · {cfg.version}</span>
        {!isConfigured && (
          <span className="rounded bg-signal-warn/20 px-2 py-0.5 text-[11px] text-signal-warn">
            modo demo · sin persistencia
          </span>
        )}
      </div>

      <Slider k="poisson_weight" label="Poisson / Dixon-Coles" />
      <Slider k="elo_weight" label="Elo" />
      <Slider k="context_weight" label="Ajuste contextual" />

      <div className="rounded-md border border-terminal-border bg-terminal-bg p-3 text-xs">
        <div className="label mb-1">Reparto efectivo (normalizado)</div>
        <div className="tabular flex gap-4">
          <span>Poisson {pct(norm.poisson)}</span>
          <span>Elo {pct(norm.elo)}</span>
          <span>Ctx {pct(norm.context)}</span>
        </div>
      </div>

      <div>
        <div className="flex justify-between text-sm">
          <span className="text-terminal-muted">Umbral de value</span>
          <span className="tabular">{(cfg.value_threshold * 100).toFixed(0)}%</span>
        </div>
        <input
          type="range"
          min={0}
          max={0.2}
          step={0.01}
          value={cfg.value_threshold}
          onChange={(e) => set('value_threshold', Number(e.target.value))}
          className="mt-1 w-full accent-signal-info"
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={onSave}
          disabled={saving || !isConfigured}
          className="rounded-md bg-signal-info px-4 py-2 text-sm font-medium text-black disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
        {msg && <span className="text-xs text-terminal-muted">{msg}</span>}
        {!isConfigured && (
          <span className="text-xs text-terminal-muted">Conecta Supabase (rol admin) para guardar.</span>
        )}
      </div>
    </div>
  );
}
