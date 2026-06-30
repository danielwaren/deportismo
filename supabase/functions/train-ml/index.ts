import { createClient } from 'jsr:@supabase/supabase-js@2';

// train-ml — entrena la regresión logística (modelo ML del ensemble) sobre las
// features PRE-PARTIDO de ml_training_samples (sin look-ahead) y guarda los pesos
// en ml_models. Idempotente: re-entrena y reemplaza. La invoca el cron tras el
// entrenamiento de Elo. Lógica de logreg vendorizada (Deno no resuelve imports
// relativos sin extensión); mantener sincronizada con packages/model/logreg.ts.

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

const FEATURE_NAMES = ['elo_general', 'matchup_home', 'matchup_away', 'home_adv', 'form_diff', 'rest_adv'];

const softmax = (z: number[]) => { const m = Math.max(...z); const e = z.map((v) => Math.exp(v - m)); const s = e.reduce((a, b) => a + b, 0) || 1; return e.map((v) => v / s); };

function train(samples: { f: number[]; y: number }[], epochs = 400, lr = 0.4, l2 = 1e-3) {
  const n = samples[0].f.length;
  const mean = new Array(n).fill(0), std = new Array(n).fill(0);
  for (const s of samples) for (let j = 0; j < n; j++) mean[j] += s.f[j] / samples.length;
  for (const s of samples) for (let j = 0; j < n; j++) std[j] += (s.f[j] - mean[j]) ** 2 / samples.length;
  for (let j = 0; j < n; j++) std[j] = Math.sqrt(std[j]) || 1;
  const X = samples.map((s) => s.f.map((v, j) => (v - mean[j]) / std[j]));
  const w = [0, 1, 2].map(() => new Array(n).fill(0)); const b = [0, 0, 0];
  for (let ep = 0; ep < epochs; ep++) {
    const gw = [0, 1, 2].map(() => new Array(n).fill(0)); const gb = [0, 0, 0];
    for (let i = 0; i < X.length; i++) {
      const x = X[i];
      const p = softmax([0, 1, 2].map((c) => b[c] + w[c].reduce((a, wj, j) => a + wj * x[j], 0)));
      for (let c = 0; c < 3; c++) { const err = p[c] - (samples[i].y === c ? 1 : 0); gb[c] += err / X.length; for (let j = 0; j < n; j++) gw[c][j] += (err * x[j]) / X.length; }
    }
    for (let c = 0; c < 3; c++) { b[c] -= lr * gb[c]; for (let j = 0; j < n; j++) w[c][j] -= lr * (gw[c][j] + l2 * w[c][j]); }
  }
  return { w, b, mean, std, featureNames: FEATURE_NAMES };
}

Deno.serve(async () => {
  try {
    const rows: any[] = [];
    let from = 0;
    // pagina por si hay >1000 filas
    while (true) {
      const { data, error } = await admin.from('ml_training_samples').select('home_elo,away_elo,home_adv,label').range(from, from + 999);
      if (error) throw error;
      if (!data || data.length === 0) break;
      rows.push(...data);
      if (data.length < 1000) break;
      from += 1000;
    }
    if (rows.length < 50) return Response.json({ error: 'pocos datos', n: rows.length }, { status: 400 });

    const samples = rows.map((r) => ({
      f: [(Number(r.home_elo) - Number(r.away_elo)) / 100, 0, 0, Number(r.home_adv) / 100, 0, 0],
      y: Number(r.label),
    }));
    const weights = train(samples);

    // precisión de entrenamiento (sanity)
    const std = (x: number[]) => x.map((v, j) => (v - weights.mean[j]) / weights.std[j]);
    let hits = 0;
    for (const s of samples) {
      const x = std(s.f);
      const p = softmax([0, 1, 2].map((c) => weights.b[c] + weights.w[c].reduce((a, wj, j) => a + wj * x[j], 0)));
      const pred = p.indexOf(Math.max(...p));
      if (pred === s.y) hits++;
    }

    await admin.from('ml_models').upsert({ id: 'logreg', version: '1.0.0', weights, n_samples: samples.length, trained_at: new Date().toISOString() }, { onConflict: 'id' });
    return Response.json({ trained: samples.length, train_accuracy: Number((hits / samples.length).toFixed(3)) });
  } catch (e) {
    return Response.json({ error: String((e as Error)?.message ?? e) }, { status: 500 });
  }
});
