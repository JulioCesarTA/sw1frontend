/**
 * tf-offline.service.ts
 *
 * Downloads TF model weights + offline data from the server when online.
 * Caches everything in IndexedDB.
 * When offline, runs the same inference logic using TF.js in the browser.
 *
 * Supports:
 *   - AnomalyDetector  (autoencoder per workflow)
 *   - DelayPredictor   (3-feature Dense classifier)
 *   - BottleneckPredictor (4-feature Dense classifier)
 *   - PriorityRanker   (pure math, no model)
 *   - WorkflowMatcher  (cosine similarity + field coverage)
 *   - FormFiller       (text classification + regex)
 */

import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import * as tf from '@tensorflow/tfjs';
import { firstValueFrom } from 'rxjs';

const DB_NAME  = 'tf_offline_v1';
const DB_VER   = 1;
const STORE    = 'cache';

const BASE      = environment.apiUrl;   // '/api'
const TF_BASE   = `${BASE}/workflow-ai`;

// ─── IndexedDB helpers ───────────────────────────────────────────────────────

function openDB(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => res(req.result);
    req.onerror   = () => rej(req.error);
  });
}

async function idbSet(key: string, value: unknown): Promise<void> {
  const db  = await openDB();
  return new Promise((res, rej) => {
    const tx  = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => res();
    tx.onerror    = () => rej(tx.error);
  });
}

async function idbGet<T>(key: string): Promise<T | null> {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx  = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => res(req.result ?? null);
    req.onerror   = () => rej(req.error);
  });
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface OfflineData {
  wf_map:             Record<string, any>;
  nodo_map:           Record<string, any>;
  tramites_activos:   any[];
  historial:          any[];
  anomaly_thresholds: Record<string, number>;
  delay_rates:        Record<string, number>;
  node_overtime:      Record<string, number>;
  node_visits:        Record<string, number>;
}

interface ModelWeights {
  weights:      Array<{ name: string; shape: number[]; data: number[] }>;
  architecture?: any[];
  threshold?:   number;
  delay_rates?: Record<string, number>;
  node_overtime?: Record<string, number>;
  node_visits?:  Record<string, number>;
  vocabulary?:  string[];
  seqLen?:      number;
  cmdTypes?:    string[];
  trainTexts?:  string[];
  trainLabels?: number[];
  workflows?:   any[];
}

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class TfOfflineService {

  private offlineData:        OfflineData | null = null;
  private delayModel:         tf.LayersModel | null = null;
  private bottleneckModel:    tf.LayersModel | null = null;
  private anomalyModels:      Map<string, { model: tf.LayersModel; threshold: number }> = new Map();
  private wfMatcherData:      ModelWeights | null = null;
  private formFillerModel:    tf.LayersModel | null = null;
  private formFillerVocab:    Map<string, number> | null = null;
  private formFillerCmdTypes: string[] = ['FIELD_ASSIGN', 'GRID_INIT', 'GRID_COLUMN', 'UNKNOWN'];
  private formFillerSeqLen:   number = 20;
  private initialized  = false;
  private initializing = false;

  constructor(private http: HttpClient) {}

  // ── Public: initialize on app start (no-op si ya corrió) ────────────────

  async initialize(): Promise<void> {
    if (this.initialized || this.initializing) return;
    return this._doInit();
  }

  // ── Public: forzar re-descarga (llamar justo después del login) ──────────

  async reinitialize(): Promise<void> {
    if (this.initializing) return;
    this.initialized = false;
    return this._doInit();
  }

  private async _doInit(): Promise<void> {
    this.initializing = true;
    try {
      await this._loadFromCacheOrServer();
      this.initialized = true;
      console.log('[TfOffline] ✓ modelos listos — wf_map keys:', Object.keys(this.offlineData?.wf_map ?? {}).length);
    } catch (e) {
      console.warn('[TfOffline] init error:', e);
    } finally {
      this.initializing = false;
    }
  }

  private async _loadFromCacheOrServer(): Promise<void> {
    const isOnline = navigator.onLine;

    if (isOnline) {
      // Download fresh data and cache it
      try {
        const data = await firstValueFrom(
          this.http.get<OfflineData>(`${TF_BASE}/models/offline-data`)
        );
        this.offlineData = data;
        await idbSet('offline_data', data);
      } catch (e) {
        console.warn('[TfOffline] Could not fetch offline-data, loading from cache');
        this.offlineData = await idbGet<OfflineData>('offline_data');
      }

      // Download model weights in parallel
      await Promise.allSettled([
        this._loadModel('delay_predictor'),
        this._loadModel('bottleneck_predictor'),
        this._loadWfMatcher(),
        this._loadFormFiller(),
        this._loadAnomalyModels(),
      ]);
    } else {
      // Load from IndexedDB
      this.offlineData = await idbGet<OfflineData>('offline_data');
      await Promise.allSettled([
        this._restoreModel('delay_predictor'),
        this._restoreModel('bottleneck_predictor'),
        this._restoreWfMatcher(),
        this._restoreFormFiller(),
        this._restoreAnomalyModels(),
      ]);
    }
  }

  // ── Model loading helpers ────────────────────────────────────────────────

  private async _fetchWeights(name: string): Promise<ModelWeights | null> {
    try {
      const url = `${TF_BASE}/static/models/${name}/model.json`;
      return await firstValueFrom(this.http.get<ModelWeights>(url));
    } catch { return null; }
  }

  private _buildFromWeights(mw: ModelWeights, arch: any[]): tf.LayersModel {
    const layers: tf.layers.Layer[] = [];
    for (const l of arch) {
      if (l.dropout !== undefined) {
        layers.push(tf.layers.dropout({ rate: l.dropout }));
      } else {
        layers.push(tf.layers.dense({
          units: l.units,
          activation: l.activation,
          ...(l.inputShape ? { inputShape: l.inputShape } : {}),
        }));
      }
    }
    const model = tf.sequential({ layers });
    model.compile({ optimizer: 'adam', loss: 'meanSquaredError' });
    // Build weights by running a dummy prediction
    const inputShape = arch.find(l => l.inputShape)?.inputShape ?? [3];
    model.predict(tf.zeros([1, ...inputShape]));

    const tensors = mw.weights.map(w => tf.tensor(w.data, w.shape));
    model.setWeights(tensors);
    tensors.forEach(t => t.dispose());
    return model;
  }

  private async _loadModel(name: string): Promise<void> {
    const mw = await this._fetchWeights(name);
    if (!mw) return;
    await idbSet(`model_${name}`, mw);
    this._assignModel(name, mw);
  }

  private async _restoreModel(name: string): Promise<void> {
    const mw = await idbGet<ModelWeights>(`model_${name}`);
    if (mw) this._assignModel(name, mw);
  }

  private _assignModel(name: string, mw: ModelWeights): void {
    const arch = mw.architecture;
    if (!arch) return;
    try {
      const model = this._buildFromWeights(mw, arch);
      if (name === 'delay_predictor') {
        this.delayModel = model;
        if (mw.delay_rates && this.offlineData) {
          this.offlineData.delay_rates = { ...this.offlineData.delay_rates, ...mw.delay_rates };
        }
      } else if (name === 'bottleneck_predictor') {
        this.bottleneckModel = model;
      }
    } catch (e) {
      console.warn(`[TfOffline] _assignModel ${name}:`, e);
    }
  }

  // ── Anomaly per-workflow models ──────────────────────────────────────────

  private async _loadAnomalyModels(): Promise<void> {
    if (!this.offlineData) return;
    const wfIds = Object.keys(this.offlineData.wf_map);
    const fetched: Record<string, ModelWeights> = {};
    await Promise.allSettled(wfIds.map(async wid => {
      const mw = await this._fetchWeights(`anomaly/${wid}`);
      if (mw) fetched[wid] = mw;
    }));
    await idbSet('anomaly_models', fetched);
    this._buildAnomalyModels(fetched);
  }

  private async _restoreAnomalyModels(): Promise<void> {
    const fetched = await idbGet<Record<string, ModelWeights>>('anomaly_models');
    if (fetched) this._buildAnomalyModels(fetched);
  }

  private _buildAnomalyModels(fetched: Record<string, ModelWeights>): void {
    for (const [wid, mw] of Object.entries(fetched)) {
      if (!mw.architecture) continue;
      try {
        const model = this._buildFromWeights(mw, mw.architecture);
        const threshold = mw.threshold
          ?? this.offlineData?.anomaly_thresholds?.[wid]
          ?? 0.05;
        this.anomalyModels.set(wid, { model, threshold });
      } catch (e) {
        console.warn(`[TfOffline] anomaly model ${wid}:`, e);
      }
    }
  }

  // ── WorkflowMatcher ──────────────────────────────────────────────────────

  private async _loadWfMatcher(): Promise<void> {
    const mw = await this._fetchWeights('workflow_matcher');
    if (!mw) return;
    await idbSet('model_workflow_matcher', mw);
    this.wfMatcherData = mw;
  }

  private async _restoreWfMatcher(): Promise<void> {
    const mw = await idbGet<ModelWeights>('model_workflow_matcher');
    if (mw) this.wfMatcherData = mw;
  }

  // ── FormFiller ───────────────────────────────────────────────────────────

  private async _loadFormFiller(): Promise<void> {
    const mw = await this._fetchWeights('form_filler');
    if (!mw) return;
    await idbSet('model_form_filler', mw);
    this._buildFormFiller(mw);
  }

  private async _restoreFormFiller(): Promise<void> {
    const mw = await idbGet<ModelWeights>('model_form_filler');
    if (mw) this._buildFormFiller(mw);
  }

  private _buildFormFiller(mw: ModelWeights): void {
    if (!mw.vocabulary) return;
    try {
      const vocab    = mw.vocabulary;
      const seqLen   = mw.seqLen ?? 20;
      const vocabSize = vocab.length;
      this.formFillerSeqLen   = seqLen;
      this.formFillerCmdTypes = mw.cmdTypes ?? this.formFillerCmdTypes;

      const vocabMap = new Map<string, number>();
      vocab.forEach((w, i) => vocabMap.set(w, i));
      this.formFillerVocab = vocabMap;

      const arch = [
        { type: 'embedding', vocabSize: vocabSize + 1, embedDim: 16, inputLen: seqLen },
        { type: 'globalAvgPool' },
        { units: 32, activation: 'relu' as const },
        { units: (mw.cmdTypes ?? this.formFillerCmdTypes).length, activation: 'softmax' as const },
      ];

      const model = tf.sequential();
      model.add(tf.layers.embedding({ inputDim: vocabSize + 1, outputDim: 16, inputLength: seqLen, maskZero: true }));
      model.add(tf.layers.globalAveragePooling1d());
      model.add(tf.layers.dense({ units: 32, activation: 'relu' }));
      model.add(tf.layers.dense({ units: (mw.cmdTypes ?? this.formFillerCmdTypes).length, activation: 'softmax' }));
      model.compile({ optimizer: 'adam', loss: 'sparseCategoricalCrossentropy' });
      model.predict(tf.zeros([1, seqLen]));

      const tensors = mw.weights.map(w => tf.tensor(w.data, w.shape));
      model.setWeights(tensors);
      tensors.forEach(t => t.dispose());
      this.formFillerModel = model;
    } catch (e) {
      console.warn('[TfOffline] _buildFormFiller:', e);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PUBLIC INFERENCE METHODS
  // ─────────────────────────────────────────────────────────────────────────

  isReady(): boolean {
    return this.offlineData != null;
  }

  // ── PriorityRanker (pure math) ───────────────────────────────────────────

  rankPriorityOffline(workflowId: string): any {
    const od = this.offlineData;
    if (!od) return null;
    const wf = od.wf_map[workflowId];
    if (!wf) return null;

    const tramites = od.tramites_activos.filter(t => t.workflowId === workflowId);
    const expectedH = wf.total_expected_min / 60;
    const now = Date.now();

    const ranked = tramites.map(t => {
      const created = new Date(t.createdAt).getTime();
      const elapsedH = Math.max(0, (now - created) / 3600000);
      return { ...t, elapsedH };
    });

    const maxElapsed = Math.max(...ranked.map(r => r.elapsedH), 1);
    const result = ranked.map((t, i) => ({
      id: t._id,
      code: t.code,
      title: t.title,
      workflowName: wf.name,
      status: t.status,
      elapsedHours: Math.round(t.elapsedH * 10) / 10,
      expectedHours: Math.round(expectedH * 10) / 10,
      urgencyScore: Math.round((t.elapsedH / maxElapsed) * 1000) / 1000,
      urgencyLevel: this._urgencyLevel(t.elapsedH, expectedH),
      rank: i + 1,
    })).sort((a, b) => b.urgencyScore - a.urgencyScore);

    result.forEach((r, i) => r.rank = i + 1);
    return { workflowId, workflowName: wf.name, total: result.length, ranked: result, trainedOn: tramites.length };
  }

  private _urgencyLevel(elapsedH: number, expectedH: number): string {
    const ratio = elapsedH / Math.max(expectedH, 0.1);
    if (ratio >= 3.0) return 'CRITICAL';
    if (ratio >= 1.5) return 'HIGH';
    if (ratio >= 0.75) return 'MEDIUM';
    return 'LOW';
  }

  // ── DelayPredictor ───────────────────────────────────────────────────────

  async predictDelayOffline(workflowId: string): Promise<any> {
    const od = this.offlineData;
    if (!od) return null;
    const wf = od.wf_map[workflowId];
    if (!wf) return null;

    const histRate = od.delay_rates[workflowId] ?? null;
    if (histRate === null) return { workflowId, workflowName: wf.name, available: false, message: 'Sin datos históricos' };

    let prob = histRate;
    if (this.delayModel) {
      try {
        const feat = tf.tensor2d([[
          Math.min(wf.total_expected_min / 480, 1),
          Math.min(wf.num_nodos / 10, 1),
          histRate,
        ]]);
        const pred = this.delayModel.predict(feat) as tf.Tensor;
        const tfProb = (await pred.data())[0];
        prob = Math.round((0.6 * tfProb + 0.4 * histRate) * 1000) / 1000;
        feat.dispose(); pred.dispose();
      } catch (e) {
        console.warn('[TfOffline] delay predict:', e);
      }
    }

    const level = prob >= 0.7 ? 'ALTO' : prob >= 0.4 ? 'MEDIO' : 'BAJO';
    const extraH = prob > 0.5 ? Math.round(wf.total_expected_min / 60 * Math.max(0, prob - 0.5) * 2 * 10) / 10 : 0;
    return {
      workflowId, workflowName: wf.name, available: true,
      delayProbability: prob, riskLevel: level,
      extraHoursEstimated: extraH,
      totalExpectedHours: Math.round(wf.total_expected_min / 60 * 10) / 10,
      numNodos: wf.num_nodos, historicalDelayRate: Math.round(histRate * 1000) / 1000,
    };
  }

  // ── BottleneckPredictor ──────────────────────────────────────────────────

  async predictBottleneckOffline(workflowId: string): Promise<any> {
    const od = this.offlineData;
    if (!od || !this.bottleneckModel) return null;
    const wf = od.wf_map[workflowId];
    if (!wf) return null;

    const nodos = wf.nodos ?? [];
    const totN  = Math.max(nodos.length, 1);
    const nodes_out = [];

    for (let i = 0; i < nodos.length; i++) {
      const n    = nodos[i];
      const nid  = n.id;
      const avgM = n.avgMinutes ?? 30;
      const histOt = od.node_overtime[nid] ?? 1.0;
      const nVis   = od.node_visits[nid]   ?? 0;

      const feat = tf.tensor2d([[
        Math.min(avgM / 120, 1),
        i / totN,
        Math.min(histOt / 3, 1),
        Math.min(nVis / 50, 1),
      ]]);
      const pred = this.bottleneckModel.predict(feat) as tf.Tensor;
      let prob = (await pred.data())[0];
      feat.dispose(); pred.dispose();

      if (histOt >= 2.0) prob = Math.min(1, prob + 0.25);
      else if (histOt >= 1.5) prob = Math.min(1, prob + 0.1);
      prob = Math.round(prob * 1000) / 1000;

      const risk = prob >= 0.7 ? 'CRITICO' : prob >= 0.45 ? 'ALTO' : prob >= 0.25 ? 'MEDIO' : 'BAJO';
      nodes_out.push({ nodoId: nid, nodoName: n.name ?? 'Nodo', avgMinutes: avgM, bottleneckProb: prob, riskLevel: risk, historicalOvertime: Math.round(histOt * 100) / 100, visits: nVis });
    }

    nodes_out.sort((a, b) => b.bottleneckProb - a.bottleneckProb);
    const top = nodes_out[0] ?? null;
    const summary = top ? `Nodo con mayor riesgo: '${top.nodoName}' — ${Math.round(top.bottleneckProb * 100)}% probabilidad.` : 'Sin datos.';
    return { workflowId, workflowName: wf.name, nodes: nodes_out, topBottleneck: top, summary };
  }

  // ── AnomalyDetector ──────────────────────────────────────────────────────

  async detectAnomaliesOffline(workflowId: string): Promise<any> {
    const od = this.offlineData;
    if (!od) return null;
    const wf = od.wf_map[workflowId];
    if (!wf) return null;

    const entry = this.anomalyModels.get(workflowId);
    if (!entry) return { workflowId, workflowName: wf.name, total: 0, totalAnomalies: 0, anomalies: [], normal: [], trainedOn: 0 };

    const { model, threshold } = entry;
    const tramites = od.tramites_activos.filter(t => t.workflowId === workflowId);
    if (!tramites.length) return { workflowId, workflowName: wf.name, total: 0, totalAnomalies: 0, anomalies: [], normal: [], trainedOn: 0 };

    const expMin = Math.max(wf.total_expected_min, 1);
    const wfLoad = Math.min(tramites.length / 8, 1);
    const now = Date.now();

    // Build last historial per tramite
    const lastHist: Record<string, any> = {};
    for (const h of od.historial) {
      const tid = h.tramiteId;
      if (!lastHist[tid] || new Date(h.changedAt) > new Date(lastHist[tid].changedAt)) {
        lastHist[tid] = h;
      }
    }

    const features: number[][] = [];
    const meta: any[] = [];

    for (const t of tramites) {
      const createdMs   = new Date(t.createdAt).getTime();
      const elapsedH    = Math.max(0, (now - createdMs) / 3600000);
      const elapsedRatio = Math.min((elapsedH * 60) / expMin / 3, 1);

      const nodoInfo = od.nodo_map[t.currentNodoId ?? ''];
      const nodoPos  = nodoInfo ? nodoInfo.order / Math.max(wf.num_nodos - 1, 1) : 0.5;

      const lh = lastHist[t._id];
      const timeInNodoMin = lh
        ? Math.max(0, (now - new Date(lh.changedAt).getTime()) / 60000)
        : elapsedH * 60;
      const avgNodoMin = nodoInfo?.avgMinutes ?? (expMin / Math.max(wf.num_nodos, 1));
      const timeInRatio = Math.min(timeInNodoMin / Math.max(avgNodoMin, 1) / 3, 1);

      features.push([elapsedRatio, nodoPos, timeInRatio, wfLoad]);
      meta.push({ t, elapsedH, expH: expMin / 60, timeInNodoMin, avgNodoMin, nodoPos });
    }

    const X = tf.tensor2d(features);
    const recon = model.predict(X) as tf.Tensor;
    const errors = tf.mean(tf.square(tf.sub(X, recon)), 1);
    const errData = await errors.data();
    const reconData = await recon.array() as number[][];
    X.dispose(); recon.dispose(); errors.dispose();

    const NAMES = ['elapsed_ratio', 'nodo_position_ratio', 'time_in_nodo_ratio', 'wf_load'];
    const anomalies: any[] = [], normal: any[] = [];

    for (let i = 0; i < meta.length; i++) {
      const { t, elapsedH, expH, timeInNodoMin, avgNodoMin, nodoPos } = meta[i];
      const error      = errData[i];
      const isAnomaly  = error > threshold;
      const featErrors = features[i].map((f, j) => Math.pow(f - reconData[i][j], 2));
      const topIdx     = featErrors.indexOf(Math.max(...featErrors));
      const score      = Math.round(Math.min(error / Math.max(threshold * 2, 1e-8), 1) * 1000) / 1000;

      const entry = {
        id: t._id, code: t.code, title: t.title,
        workflowName: wf.name, status: t.status,
        elapsedHours: Math.round(elapsedH * 10) / 10,
        expectedHours: Math.round(expH * 10) / 10,
        anomalyScore: score, isAnomaly,
        mainFactor: NAMES[topIdx],
      };
      (isAnomaly ? anomalies : normal).push(entry);
    }

    anomalies.sort((a, b) => b.anomalyScore - a.anomalyScore);
    return { workflowId, workflowName: wf.name, trainedOn: 0, total: tramites.length, totalAnomalies: anomalies.length, anomalies, normal };
  }

  // ── WorkflowMatcher ──────────────────────────────────────────────────────

  matchWorkflowOffline(userText: string, docTexts: string[] = []): any[] {
    const mw = this.wfMatcherData;
    if (!mw?.workflows?.length) return [];

    const vocab   = mw.vocabulary ?? [];
    const seqLen  = mw.seqLen ?? 30;
    const vocabMap = new Map<string, number>();
    vocab.forEach((w, i) => vocabMap.set(w, i));

    const normalize = (t: string) => t.toLowerCase()
      .replace(/[áéíóúñ]/g, c => ({ á:'a',é:'e',í:'i',ó:'o',ú:'u',ñ:'n' } as any)[c] ?? c)
      .replace(/[^\w\s]/g, ' ');

    const tokenize = (text: string): number[] => {
      const words = normalize(text).split(/\s+/).filter(Boolean);
      const ids   = words.map(w => vocabMap.get(w) ?? 0);
      while (ids.length < seqLen) ids.push(0);
      return ids.slice(0, seqLen);
    };

    const embed = (tokens: number[]): number[] => {
      // Simple bag-of-words average over vocabulary positions (offline fallback)
      const vec = new Array(32).fill(0);
      let count = 0;
      for (const t of tokens) {
        if (t > 0) { vec[t % 32] += 1; count++; }
      }
      if (count > 0) for (let i = 0; i < vec.length; i++) vec[i] /= count;
      return vec;
    };

    const cosine = (a: number[], b: number[]): number => {
      let dot = 0, na = 0, nb = 0;
      for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
      return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-8);
    };

    const allText   = [userText, ...docTexts].join(' ');
    const queryEmb  = embed(tokenize(allText));
    const allChecks = [userText, ...docTexts];

    return mw.workflows.map((w: any) => {
      const wfEmb = w.embedding?.length ? w.embedding : embed(tokenize(w.text ?? ''));
      const cos   = Math.max(0, cosine(queryEmb, wfEmb));

      const required: string[] = w.required ?? [];
      const optional: string[] = w.optional ?? [];

      const normAll = allChecks.map(normalize);
      const presentReq = required.filter(f => normAll.some(t => t.includes(normalize(f))));
      const missingReq = required.filter(f => !presentReq.includes(f));
      const presentOpt = optional.filter(f => normAll.some(t => t.includes(normalize(f))));
      const docsComplete = required.length > 0 && missingReq.length === 0;
      const docScore = required.length > 0 ? presentReq.length / required.length : 0;
      const total = docsComplete ? 1.0 : (required.length > 0 ? 0.35 * cos + 0.65 * docScore : cos);

      return {
        workflowId: w.id, workflowName: w.name, workflowDescription: w.description,
        score: Math.round(total * 1000) / 10,
        cosSim: Math.round(cos * 1000) / 10,
        confidence: total >= 0.7 ? 'Alta' : total >= 0.4 ? 'Media' : 'Baja',
        requiredDocs: required, optionalDocs: optional,
        presentRequired: presentReq, missingRequired: missingReq,
        presentOptional: presentOpt, docsComplete,
      };
    }).sort((a: any, b: any) => b.score - a.score).slice(0, 3);
  }

  // ── FormFiller ───────────────────────────────────────────────────────────

  async fillFormOffline(transcript: string, fields: any[]): Promise<any> {
    if (!this.formFillerModel || !this.formFillerVocab) return null;

    const normalize = (t: string) => t.toLowerCase()
      .replace(/[áéíóúñ]/g, c => ({ á:'a',é:'e',í:'i',ó:'o',ú:'u',ñ:'n' } as any)[c] ?? c)
      .replace(/[^\w\s]/g, ' ');

    const tokenize = (text: string): number[] => {
      const words = normalize(text).split(/\s+/).filter(Boolean);
      const ids   = words.map(w => this.formFillerVocab!.get(w) ?? 0);
      while (ids.length < this.formFillerSeqLen) ids.push(0);
      return ids.slice(0, this.formFillerSeqLen);
    };

    const classify = async (segment: string): Promise<string> => {
      const ids  = tokenize(segment);
      const inp  = tf.tensor2d([ids], [1, this.formFillerSeqLen]);
      const pred = this.formFillerModel!.predict(inp) as tf.Tensor;
      const data = await pred.data();
      inp.dispose(); pred.dispose();
      const idx = Array.from(data).indexOf(Math.max(...Array.from(data)));
      return this.formFillerCmdTypes[idx] ?? 'UNKNOWN';
    };

    // Regex helpers
    const MONTHS: Record<string, number> = {
      enero:1,febrero:2,marzo:3,abril:4,mayo:5,junio:6,
      julio:7,agosto:8,septiembre:9,octubre:10,noviembre:11,diciembre:12
    };
    const parseDate = (val: string): string => {
      const v = val.toLowerCase();
      let m = v.match(/(\d{1,2})\s+(?:de\s+)?(\w+)\s+(?:de\s+)?(\d{4})/);
      if (m) {
        const month = MONTHS[m[2]];
        if (month) return `${m[3].padStart(4,'0')}-${String(month).padStart(2,'0')}-${m[1].padStart(2,'0')}`;
      }
      m = v.match(/(\d{1,2})[/\-\s](\d{1,2})[/\-\s](\d{4})/);
      if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
      return val;
    };

    const fieldLookup: Record<string, string> = {};
    const fieldTypes:  Record<string, string> = {};
    const gridColLookup: Record<string, Record<string, string>> = {};
    for (const f of fields) {
      const actual = f.name ?? '';
      const n = normalize(actual);
      fieldLookup[n] = actual;
      fieldLookup[n.replace(/_/g, ' ')] = actual;
      fieldTypes[actual] = f.type ?? 'TEXT';
      if (f.type === 'GRID') {
        gridColLookup[actual] = {};
        for (const c of (f.columns ?? [])) {
          gridColLookup[actual][normalize(c.name ?? '')] = c.name ?? '';
        }
      }
    }

    const segments = transcript.split(/[,;]\s*/).map(s => s.trim()).filter(s => s.length > 3);
    const result: Record<string, any> = {};
    const gridRows: Record<string, any[]> = {};
    const applied: any[] = [];
    const warnings: string[] = [];
    let lastGrid: string | null = null;
    const PONELE = '(?:ponele|ponerle|ponle|le pon)';

    for (const seg of segments) {
      const cmd = await classify(seg);
      const t   = normalize(seg);

      if (cmd === 'FIELD_ASSIGN') {
        const m = t.match(new RegExp(`campo\\s+([\\w\\s]+?)\\s+${PONELE}\\s+(.+)`));
        if (m) {
          const actual = fieldLookup[m[1].trim()] ?? m[1].trim();
          let val = m[2].trim();
          if (fieldTypes[actual] === 'DATE') val = parseDate(val);
          result[actual] = val;
        }
      } else if (cmd === 'GRID_INIT') {
        const m = t.match(/campo\s+([\w\s]+?)\s+insertale/);
        if (m) {
          const actual = fieldLookup[m[1].trim()] ?? m[1].trim();
          if (!gridRows[actual]) gridRows[actual] = [{}];
          lastGrid = actual;
        }
      } else if (cmd === 'GRID_COLUMN' && lastGrid) {
        const m = t.match(new RegExp(`columna\\s+(\\w+)\\s+de\\s+la\\s+fila\\s+(\\d+)\\s+${PONELE}\\s+(.+)`));
        if (m) {
          const colRaw = m[1];
          const rowN   = parseInt(m[2]) - 1;
          const val    = m[3].trim();
          const col    = gridColLookup[lastGrid]?.[colRaw] ?? colRaw;
          while (gridRows[lastGrid].length <= rowN) gridRows[lastGrid].push({});
          gridRows[lastGrid][rowN][col] = val;
        }
      }
    }

    Object.assign(result, gridRows);

    for (const f of fields) {
      if (f.type === 'FILE') continue;
      const fname = f.name ?? '';
      if (result[fname] !== undefined) {
        const val = result[fname];
        applied.push({ field: fname, value: Array.isArray(val) ? `${val.length} fila(s)` : String(val) });
      } else if (normalize(transcript).includes(normalize(fname))) {
        warnings.push(`No pude detectar el valor para '${fname}'.`);
      }
    }

    if (!applied.length && !warnings.length) {
      warnings.push("No se detectó ningún valor. Di: 'en el campo [nombre] ponele [valor]'");
    }

    return { transcript, formData: result, appliedFields: applied, warnings };
  }
}
