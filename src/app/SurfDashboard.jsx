import React, { useState, useEffect } from "react";
import { SPOTS, BOARDS } from "../data/defaultSpots.js";
import { loadUserProfile, loadUserProfileLocal, saveUserProfile } from "../services/userProfile.js";
import { loadSurfSessions, saveSurfSession, deleteSurfSession } from "../services/surfSessions.js";
import { buildAiRecommendationPrompt } from "../ai/buildAiRecommendationPrompt.js";
import { calibrateSpotConfigFromMarine } from "../forecast/surfForecast.js";
import { fetchNdbcBuoyObservation, fetchNdbcBuoysByStation } from "../services/ndbc/ndbcClient.js";
import {
  buildSpotCondition,
  fetchSpotForecastBundle,
  fetchMissingSpotData,
} from "../forecast/buildSpotCondition.js";
import { buildSpotDataMapForDate, rankSpots, computeDisplayScore } from "../forecast/spotRanking.js";
import {
  getNdbcStationIdForSpot,
  getNearestTideStationMeta,
  getNearestBuoyMeta,
  deriveRegionHintFromSpotName,
  getSpotScoringConfig,
} from "../forecast/spotRegistry.js";
import {
  breakTypeKeyToDisplay,
  difficultyKeyToDisplay,
} from "../forecast/userSpotConfig.js";
import { deriveCityFromPlaceOrLabel, normalizeSpotName, createSpotId } from "../lib/format.js";
import {
  getAiModel,
  getAiFallbackModel,
  getAnthropicMessagesUrl,
  isLikelyTransientAiError,
  sleep,
} from "../lib/aiClient.js";
import { fetchMarine, fetchWind, todayForecastDate, getForecastDateBounds, formatForecastCenterLabel } from "../services/openMeteo.js";
import { fetchTides } from "../services/tides.js";
import { fetchDriveTimes, fetchMissingDriveTimes, resolveTomTomLocation, fetchTomTomLocationOptions } from "../services/tomtom.js";
import { fetchSurfSpotConfigFromAnthropic } from "../services/anthropicSpotConfig.js";
import SetupScreen from "../pages/SetupScreen.jsx";
import LoadingScreen from "../pages/LoadingScreen.jsx";
import Dashboard from "../pages/Dashboard.jsx";

export function SurfDashboard({ user, onLogin, onLogout }) {
  const defaultDriveOrigin = (import.meta.env.VITE_DRIVE_ORIGIN || "San Francisco, CA").trim();
  const [screen, setScreen] = useState("setup");
  const [skill, setSkill] = useState("Intermediate");
  const [quiver, setQuiver] = useState(["longboard", "shortboard"]);
  const [customBoard, setCustomBoard] = useState("");
  const [driveOrigin, setDriveOrigin] = useState(defaultDriveOrigin);
  const [driveOriginResolved, setDriveOriginResolved] = useState(null);
  const [driveOriginStatus, setDriveOriginStatus] = useState("");
  const [driveOriginOptions, setDriveOriginOptions] = useState([]);
  const [driveOriginOptionsLoading, setDriveOriginOptionsLoading] = useState(false);
  const [showDriveOriginOptions, setShowDriveOriginOptions] = useState(false);
  const [prefsReady, setPrefsReady] = useState(() => !user?.id);
  const [spots, setSpots] = useState(SPOTS);
  const [spotData, setSpotData] = useState({});
  const [driveTimes, setDriveTimes] = useState({});
  const [buoyByStation, setBuoyByStation] = useState({});
  const [spotRetryTick, setSpotRetryTick] = useState(0);
  const [tidesByStation, setTidesByStation] = useState({});
  const [activeSpot, setActiveSpot] = useState(SPOTS[0]);
  const [aiRec, setAiRec] = useState({ text: "", loading: false, retryAttempt: 1, maxAttempts: 1 });
  const [aiCalled, setAiCalled] = useState(false);
  const [driveRetryTick, setDriveRetryTick] = useState(0);
  const [addSpotOpen, setAddSpotOpen] = useState(false);
  const [addSpotName, setAddSpotName] = useState("");
  const [addSpotStatus, setAddSpotStatus] = useState("");
  const [addSpotLoading, setAddSpotLoading] = useState(false);
  const [surfSessions, setSurfSessions] = useState([]);
  const [logSessionOpen, setLogSessionOpen] = useState(false);
  const [mySessionsOpen, setMySessionsOpen] = useState(false);
  const [forecastDate, setForecastDate] = useState(() => todayForecastDate());
  const [spotForecastRaw, setSpotForecastRaw] = useState({});
  const [spotDataCache, setSpotDataCache] = useState({});

  const toggleBoard = id => setQuiver(q => q.includes(id) ? q.filter(x => x !== id) : [...q, id]);

  const applyUserProfile = profile => {
    if (!profile) return;
    setSkill(profile.skill || "Intermediate");
    if (Array.isArray(profile.quiver)) setQuiver(profile.quiver);
    setCustomBoard(profile.customBoard || "");
    if (profile.driveOrigin) {
      setDriveOrigin(profile.driveOrigin);
      setDriveOriginStatus(`Using saved location: ${profile.driveOrigin}`);
    }
    if (profile.driveOriginResolved) setDriveOriginResolved(profile.driveOriginResolved);
  };

  const resolveDriveOriginCoords = async (origin, existingResolved) => {
    if (existingResolved?.lat != null && existingResolved?.lon != null) return existingResolved;
    const apiKey = (import.meta.env.VITE_TOMTOM_API_KEY || "").trim();
    const raw = String(origin || "").trim();
    if (!raw || !apiKey) return null;
    const resolved = await resolveTomTomLocation(raw, apiKey);
    return resolved ? { lat: resolved.lat, lon: resolved.lon } : null;
  };

  const rebuildSpotForDate = (spotId, dateStr, rawOverride = null) => {
    const spot = spots.find(s => s.id === spotId);
    const raw = rawOverride || spotForecastRaw[spotId];
    if (!spot || !raw?.marine?.hourly) return null;
    const rebuilt = buildSpotCondition(
      spot,
      raw.marine,
      raw.wind,
      buoyByStation,
      tidesByStation[spot.tideStationId] || [],
      dateStr
    );
    return rebuilt;
  };

  const applyForecastDate = (dateStr, { resetAi = true } = {}) => {
    const { min, max } = getForecastDateBounds();
    const clamped = dateStr < min ? min : dateStr > max ? max : dateStr;

    setForecastDate(clamped);
    if (resetAi) {
      setAiCalled(false);
      setAiRec({ text: "", loading: false, retryAttempt: 1, maxAttempts: 1 });
    }

    const cached = spotDataCache[clamped];
    if (cached && spots.every(s => cached[s.id])) {
      setSpotData(cached);
      return cached;
    }

    const merged = { ...(cached || {}) };
    for (const spot of spots) {
      if (merged[spot.id]) continue;
      const rebuilt = rebuildSpotForDate(spot.id, clamped);
      if (rebuilt) merged[spot.id] = rebuilt;
    }

    setSpotDataCache(prev => ({ ...prev, [clamped]: merged }));
    setSpotData(merged);
    return merged;
  };

  const handleForecastDateChange = dateStr => {
    applyForecastDate(dateStr);
  };

  const loadData = async (prefsOverride = null) => {
    const prefs = {
      skill: prefsOverride?.skill ?? skill,
      quiver: prefsOverride?.quiver ?? quiver,
      customBoard: prefsOverride?.customBoard ?? customBoard,
      driveOrigin: prefsOverride?.driveOrigin ?? driveOrigin,
      driveOriginResolved: prefsOverride?.driveOriginResolved ?? driveOriginResolved,
    };

    if (prefsOverride) applyUserProfile(prefsOverride);

    if (user?.id) {
      const saveResult = await saveUserProfile(user.id, prefs);
      if (!saveResult.ok) {
        console.warn("[surf] preferences saved locally; Supabase:", saveResult.error);
      }
    }
    setScreen("loading");
    try {
      const marines = await Promise.all(spots.map(s => fetchMarine(s.lat, s.lon).catch(() => null)));
      const winds = await Promise.all(
        marines.map((m, i) => {
          const lat = m?.latitude ?? spots[i].lat;
          const lon = m?.longitude ?? spots[i].lon;
          return fetchWind(lat, lon).catch(() => null);
        })
      );
      const uniqueTideIds = [...new Set(spots.map(s => s.tideStationId).filter(Boolean))];
      const tideJsons = await Promise.all(
        uniqueTideIds.map(id => fetchTides(id).catch(() => ({ predictions: [] })))
      );
      const ndbcIds = [...new Set(spots.map(s => getNdbcStationIdForSpot(s)).filter(Boolean))];
      const nextBuoyByStation = await fetchNdbcBuoysByStation(ndbcIds);
      const resolved =
        prefs.driveOriginResolved ||
        (await resolveDriveOriginCoords(prefs.driveOrigin, prefs.driveOriginResolved));
      if (resolved) {
        setDriveOriginResolved(resolved);
        prefs.driveOriginResolved = resolved;
        if (user?.id) {
          await saveUserProfile(user.id, prefs);
        }
      }
      const originForRouting = resolved ? `${resolved.lat},${resolved.lon}` : prefs.driveOrigin;
      const nextDriveTimes = await fetchDriveTimes(spots, originForRouting);
      const nextTidesByStation = {};
      uniqueTideIds.forEach((id, i) => {
        nextTidesByStation[id] = tideJsons[i]?.predictions || [];
      });

      const today = todayForecastDate();
      const rawBySpot = {};
      spots.forEach((spot, i) => {
        rawBySpot[spot.id] = { marine: marines[i], wind: winds[i] };
      });
      const data = buildSpotDataMapForDate(spots, rawBySpot, nextBuoyByStation, nextTidesByStation, today);

      setSpotData(data);
      setSpotForecastRaw(rawBySpot);
      setSpotDataCache({ [today]: data });
      setForecastDate(today);
      setAiCalled(false);
      setAiRec({ text: "", loading: false, retryAttempt: 1, maxAttempts: 1 });
      setBuoyByStation(nextBuoyByStation);
      setSpotRetryTick(0);
      setDriveTimes(nextDriveTimes);
      setDriveRetryTick(0);
      setTidesByStation(nextTidesByStation);
      const topSpot = rankSpots(spots, data, nextTidesByStation, nextDriveTimes, surfSessions)[0];
      if (topSpot) setActiveSpot(topSpot);
      setScreen("dashboard");
    } catch (err) {
      console.error(err);
      setScreen("dashboard");
    }
  };

  useEffect(() => {
    if (!user?.id) {
      setPrefsReady(true);
      return undefined;
    }

    let cancelled = false;
    setPrefsReady(false);

    const cached = loadUserProfileLocal(user.id);
    if (cached) applyUserProfile(cached);

    (async () => {
      const profile = await loadUserProfile(user.id);
      if (cancelled) return;

      if (profile) {
        applyUserProfile(profile);
        await loadData(profile);
      }
      setPrefsReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) {
      setSurfSessions([]);
      return undefined;
    }

    let cancelled = false;
    (async () => {
      const sessions = await loadSurfSessions(user.id);
      if (!cancelled) setSurfSessions(sessions);
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const handleSaveSession = async sessionInput => {
    if (!user?.id) return;
    const result = await saveSurfSession(user.id, sessionInput);
    if (result.session) {
      setSurfSessions(prev => [result.session, ...prev.filter(s => s.id !== result.session.id)]);
    }
    if (!result.ok) {
      throw new Error(result.error || "Could not save session");
    }
  };

  const handleDeleteSession = async sessionId => {
    if (!user?.id) return;
    await deleteSurfSession(user.id, sessionId);
    setSurfSessions(prev => prev.filter(s => s.id !== sessionId));
  };

  const resolveAndAutofillDriveOrigin = async () => {
    const apiKey = (import.meta.env.VITE_TOMTOM_API_KEY || "").trim();
    const raw = driveOrigin.trim();
    if (!raw || !apiKey) return null;
    setDriveOriginStatus("Resolving location...");
    const resolved = await resolveTomTomLocation(raw, apiKey);
    if (!resolved) {
      setDriveOriginResolved(null);
      setDriveOriginStatus("Could not validate location. Try a fuller address.");
      return null;
    }
    setDriveOriginResolved({ lat: resolved.lat, lon: resolved.lon });
    if (resolved.label && resolved.label !== raw) setDriveOrigin(resolved.label);
    setDriveOriginStatus(`Using: ${resolved.label}`);
    return resolved;
  };

  const handleDriveOriginSelect = opt => {
    setDriveOrigin(opt.label);
    setDriveOriginResolved({ lat: opt.lat, lon: opt.lon });
    setDriveOriginStatus(`Using: ${opt.label}`);
    setShowDriveOriginOptions(false);
  };

  useEffect(() => {
    if (screen !== "setup") return;
    const apiKey = (import.meta.env.VITE_TOMTOM_API_KEY || "").trim();
    const q = driveOrigin.trim();
    if (!showDriveOriginOptions || !apiKey || q.length < 2) {
      setDriveOriginOptions([]);
      setDriveOriginOptionsLoading(false);
      return;
    }

    setDriveOriginOptionsLoading(true);
    const timer = setTimeout(async () => {
      const opts = await fetchTomTomLocationOptions(q, apiKey);
      setDriveOriginOptions(opts);
      setDriveOriginOptionsLoading(false);
    }, 250);

    return () => clearTimeout(timer);
  }, [driveOrigin, showDriveOriginOptions, screen]);

  const callAI = async (data, tideData, spotsForAi = spots) => {
    setAiRec({ text: "", loading: true, retryAttempt: 1, maxAttempts: 1 });

    const quiverDesc = [
      ...quiver.map(id => BOARDS.find(b => b.id === id)?.name || id),
      ...(customBoard.trim() ? [customBoard.trim()] : []),
    ].join(", ") || "unspecified";

    const rankedSpots = rankSpots(spotsForAi, data, tideData, driveTimes, surfSessions);
    const { system, userMessage } = buildAiRecommendationPrompt({
      user,
      preferences: {
        skill,
        quiverDesc,
        customBoard,
        driveOrigin: driveOrigin.trim() || "not set",
      },
      spots: spotsForAi,
      spotData: data,
      tidesByStation: tideData,
      driveTimes,
      activeSpot,
      computeDisplayScore,
      rankedSpots,
      surfSessions,
      forecastDate,
      forecastDateLabel: formatForecastCenterLabel(forecastDate),
    });

    const anthropicUrl = getAnthropicMessagesUrl();
    const primaryModel = getAiModel();
    const fallbackModel = getAiFallbackModel();
    const modelChain = [...new Set([primaryModel, fallbackModel].filter(Boolean))];
    const maxAttempts = 3;
    setAiRec({ text: "", loading: true, retryAttempt: 1, maxAttempts });

    try {
      let lastErr = "Unknown AI error";
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        setAiRec(prev => ({ ...prev, loading: true, retryAttempt: attempt, maxAttempts }));
        for (const model of modelChain) {
          const res = await fetch(anthropicUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              model,
              max_tokens: 1200,
              system,
              messages: [{ role: "user", content: userMessage }],
            }),
          });
          const json = await res.json().catch(() => ({}));
          if (!res.ok) {
            lastErr =
              json.error?.message
              || json.errors?.[0]?.message
              || json.message
              || `HTTP ${res.status}`;
            continue;
          }
          const text = json.content?.find(b => b.type === "text")?.text || "No recommendation available.";
          setAiRec({ text, loading: false, retryAttempt: attempt, maxAttempts });
          return;
        }
        if (attempt < maxAttempts && isLikelyTransientAiError(lastErr)) {
          await sleep(750 * attempt);
          continue;
        }
        break;
      }
      setAiRec({ text: `AI error: ${lastErr}`, loading: false, retryAttempt: maxAttempts, maxAttempts });
    } catch {
      setAiRec({ text: "Could not reach AI. Check your connection and try refreshing.", loading: false, retryAttempt: maxAttempts, maxAttempts });
    }
  };

  const handleAddSpot = async () => {
    const name = addSpotName.trim();
    if (!name) {
      setAddSpotStatus("Enter a spot name.");
      return;
    }
    const apiKey = (import.meta.env.VITE_TOMTOM_API_KEY || "").trim();

    setAddSpotLoading(true);
    setAddSpotStatus("Generating spot config (Claude)…");
    try {
      const regionHint = deriveRegionHintFromSpotName(
        name,
        driveOrigin.trim() || "California coast, USA"
      );
      let generatedConfig = await fetchSurfSpotConfigFromAnthropic(name, regionHint);
      if (!generatedConfig) {
        setAddSpotStatus("Could not generate a full spot configuration. Try a more specific spot name.");
        return;
      }

      setAddSpotStatus("Calibrating forecast from local marine data…");
      const marinePreview = await fetchMarine(generatedConfig.latitude, generatedConfig.longitude).catch(() => null);
      generatedConfig = calibrateSpotConfigFromMarine(generatedConfig, marinePreview?.hourly);

      const dupByName = spots.some(s =>
        normalizeSpotName(s.name) === normalizeSpotName(generatedConfig.name)
      );
      // Coordinate-only duplicate checks were causing false positives for distinct breaks
      // when AI returned approximate lat/lon. Keep duplicate protection name-based.
      if (dupByName) {
        setAddSpotStatus("That spot already exists in your list.");
        return;
      }

      const cityDisplay = deriveCityFromPlaceOrLabel(generatedConfig.region, "Custom");
      const fallbackTideMeta = getNearestTideStationMeta(generatedConfig.latitude, generatedConfig.longitude);
      const fallbackBuoyMeta = getNearestBuoyMeta(generatedConfig.latitude, generatedConfig.longitude);
      if (!generatedConfig.ndbc_station_id) {
        generatedConfig.ndbc_station_id = fallbackBuoyMeta.ndbcStationId;
      }
      const tideStationId = generatedConfig.noaa_tide_station_id || fallbackTideMeta.tideStationId || null;
      const uniqueSpotIdBase = generatedConfig.id || createSpotId(generatedConfig.name);
      const uniqueSpotId = spots.some(s => s.id === uniqueSpotIdBase)
        ? `${uniqueSpotIdBase}_${Date.now().toString(36)}`
        : uniqueSpotIdBase;
      const nextSpot = {
        id: uniqueSpotId,
        name: generatedConfig.name,
        shortName: generatedConfig.name.length > 18 ? `${generatedConfig.name.slice(0, 18)}…` : generatedConfig.name,
        lat: generatedConfig.latitude,
        lon: generatedConfig.longitude,
        type: breakTypeKeyToDisplay(generatedConfig.break_type),
        difficulty: difficultyKeyToDisplay(generatedConfig.difficulty),
        city: cityDisplay,
        tideStationId,
        tideStationLabel: tideStationId
          ? (tideStationId === fallbackTideMeta.tideStationId
            ? fallbackTideMeta.tideStationLabel
            : `NOAA ${tideStationId}`)
          : "No tide station",
        scoringConfig: generatedConfig,
      };
      const nextSpots = [...spots, nextSpot];

      setSpots(nextSpots);
      setActiveSpot(nextSpot);
      setAddSpotStatus(`Added ${nextSpot.name}. Fetching conditions...`);

      const ndbcId = generatedConfig.ndbc_station_id;
      let buoysForFetch = buoyByStation;
      if (ndbcId && !buoysForFetch[ndbcId]) {
        const obs = await fetchNdbcBuoyObservation(ndbcId);
        buoysForFetch = { ...buoysForFetch, [ndbcId]: obs };
        setBuoyByStation(buoysForFetch);
      }

      const bundle = await fetchSpotForecastBundle(
        nextSpot,
        buoysForFetch,
        tidesByStation[nextSpot.tideStationId] || [],
        forecastDate
      );
      if (bundle?.condition) {
        setSpotData(prev => ({ ...prev, [nextSpot.id]: bundle.condition }));
        setSpotForecastRaw(prev => ({ ...prev, [nextSpot.id]: { marine: bundle.marine, wind: bundle.wind } }));
        setSpotDataCache(prev => ({
          ...prev,
          [forecastDate]: { ...(prev[forecastDate] || {}), [nextSpot.id]: bundle.condition },
        }));
      }

      const originForRouting = driveOriginResolved
        ? `${driveOriginResolved.lat},${driveOriginResolved.lon}`
        : driveOrigin;
      if (apiKey) {
        const drive = await fetchDriveTimes([nextSpot], originForRouting);
        if (drive?.[nextSpot.id]) {
          setDriveTimes(prev => ({ ...prev, [nextSpot.id]: drive[nextSpot.id] }));
        }
      }

      if (!tidesByStation[nextSpot.tideStationId] && nextSpot.tideStationId) {
        const tideJson = await fetchTides(nextSpot.tideStationId).catch(() => ({ predictions: [] }));
        setTidesByStation(prev => ({
          ...prev,
          [nextSpot.tideStationId]: tideJson?.predictions || [],
        }));
      }

      setAddSpotName("");
      setAddSpotOpen(false);
      setAddSpotStatus("");
      setSpotRetryTick(0);
      setDriveRetryTick(0);
    } catch (err) {
      setAddSpotStatus(err?.message || "Failed to add spot. Check Anthropic proxy and try again.");
    } finally {
      setAddSpotLoading(false);
    }
  };

  useEffect(() => {
    if (screen !== "dashboard") return;
    const apiKey = (import.meta.env.VITE_TOMTOM_API_KEY || "").trim();
    if (!apiKey) return;
    const unresolvedCount = spots.filter(s => !driveTimes[s.id]).length;
    if (unresolvedCount === 0) return;
    if (driveRetryTick >= 6) return; // Stop after ~1 minute of retries.

    const timer = setTimeout(async () => {
      const originForRetry = driveOriginResolved
        ? `${driveOriginResolved.lat},${driveOriginResolved.lon}`
        : driveOrigin;
      const recovered = await fetchMissingDriveTimes(spots, driveTimes, originForRetry);
      if (Object.keys(recovered).length) {
        setDriveTimes(prev => ({ ...prev, ...recovered }));
      }
      setDriveRetryTick(t => t + 1);
    }, 10000);

    return () => clearTimeout(timer);
  }, [screen, driveTimes, driveRetryTick, driveOrigin, driveOriginResolved, spots]);

  useEffect(() => {
    if (screen !== "dashboard") return;
    const unresolvedCount = spots.filter(s => !spotData[s.id]).length;
    if (unresolvedCount === 0) return;
    if (spotRetryTick >= 6) return; // Stop after ~1 minute of retries.

    const timer = setTimeout(async () => {
      const recovered = await fetchMissingSpotData(
        spots,
        spotData,
        buoyByStation,
        tidesByStation,
        forecastDate
      );
      if (Object.keys(recovered.spotData).length) {
        setSpotData(prev => ({ ...prev, ...recovered.spotData }));
        setSpotForecastRaw(prev => ({ ...prev, ...recovered.rawBySpot }));
        setSpotDataCache(prev => ({
          ...prev,
          [forecastDate]: { ...(prev[forecastDate] || {}), ...recovered.spotData },
        }));
      }
      setSpotRetryTick(t => t + 1);
    }, 10000);

    return () => clearTimeout(timer);
  }, [screen, spotData, spotRetryTick, spots, buoyByStation, tidesByStation, forecastDate]);

  useEffect(() => {
    if (!activeSpot || spots.some(s => s.id === activeSpot.id)) return;
    const topSpot = rankSpots(spots, spotData, tidesByStation, driveTimes, surfSessions)[0];
    setActiveSpot(topSpot || spots[0]);
  }, [spots, activeSpot, spotData, tidesByStation, driveTimes, surfSessions]);

  if (!prefsReady) {
    return (
      <LoadingScreen
        spotCount={spots.length}
        subtitle={user?.id ? "Loading your saved preferences…" : undefined}
      />
    );
  }
  if (screen === "setup") return (
    <SetupScreen skill={skill} setSkill={setSkill} quiver={quiver}
      toggleBoard={toggleBoard} customBoard={customBoard}
      setCustomBoard={setCustomBoard} driveOrigin={driveOrigin}
      setDriveOrigin={value => {
        setDriveOrigin(value);
        setDriveOriginResolved(null);
        setDriveOriginStatus("");
        setShowDriveOriginOptions(true);
      }}
      driveOriginStatus={driveOriginStatus}
      driveOriginOptions={driveOriginOptions}
      driveOriginOptionsLoading={driveOriginOptionsLoading}
      showDriveOriginOptions={showDriveOriginOptions}
      onDriveOriginFocus={() => setShowDriveOriginOptions(true)}
      onDriveOriginSelect={handleDriveOriginSelect}
      onDriveOriginBlur={() => {
        setTimeout(() => setShowDriveOriginOptions(false), 120);
        resolveAndAutofillDriveOrigin();
      }}
      onSubmit={() => loadData()} />
  );
  if (screen === "loading") return <LoadingScreen spotCount={spots.length} />;

  return (
    <Dashboard user={user} onLogin={onLogin} onLogout={onLogout} onChangePreferences={() => setScreen("setup")} spots={spots} spotData={spotData} driveTimes={driveTimes} activeSpot={activeSpot}
      setActiveSpot={setActiveSpot} tidesByStation={tidesByStation} aiRec={aiRec}
      aiCalled={aiCalled}
      skill={skill} quiver={quiver}
      onGenerateAi={() => {
        if (aiCalled || aiRec.loading) return;
        setAiCalled(true);
        callAI(spotData, tidesByStation, spots);
      }}
      addSpotOpen={addSpotOpen} setAddSpotOpen={setAddSpotOpen}
      addSpotName={addSpotName} setAddSpotName={value => {
        setAddSpotName(value);
        setAddSpotStatus("");
      }}
      addSpotStatus={addSpotStatus} addSpotLoading={addSpotLoading}
      onAddSpot={handleAddSpot}
      surfSessions={surfSessions}
      logSessionOpen={logSessionOpen}
      setLogSessionOpen={setLogSessionOpen}
      mySessionsOpen={mySessionsOpen}
      setMySessionsOpen={setMySessionsOpen}
      onSaveSession={handleSaveSession}
      onDeleteSession={handleDeleteSession}
      getSpotScoringConfig={getSpotScoringConfig}
      forecastDate={forecastDate}
      onForecastDateChange={handleForecastDateChange} />
  );
}

