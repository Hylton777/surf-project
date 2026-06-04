# Surf Intel — Bay Area Surf Forecast & Coach

**Hylton Harvey · CS153 ·** [surf-project-sable.vercel.app](https://surf-project-sable.vercel.app/) · [GitHub](https://github.com/Hylton777/surf-project) · [Demo video](https://www.youtube.com/watch?v=demR5mERL_g)

---

## Problem & motivation

Choosing where to surf is always a challenging task; there are many factors to consider. For each of 8 spots where I typically surf, I ask myself:

How big are the waves?

How strong is the wind?

Where is the wind coming from?

What is the tide?

How long is the drive to get there?

Forecasting apps like Surfline excel at providing the answers to these questions, but they leave the surfer having to make a value judgment on which spot is the best.

**Surf Intel** combines live marine/wind models, NOAA tides, NDBC buoy observations, and **spot-specific scoring** into one dashboard, then generates a personalized AI coaching write-up based on your preferences and logged sessions. This means that the surfer does not have to waste time reviewing many different spots; instead, **Surf Intel** compiles all this data and the surfer's preferences, giving a clear recommendation on the best spot for today's forecast.

---

## Features

- **Preference setup:** skill level, quiver, and start location (for drive-time ranking)
- **Live conditions** for 8 built-in Bay Area / Santa Cruz spots
- **Spot-specific scores** (0–100) with ratings: Pumping, Good, Smooth, Decent, Bad, Poor
- **24-hour surf forecast chart** with hourly ratings and tide overlay
- **Drive times** via TomTom routing from your start location
- **NDBC buoy blending** when a nearby station has fresh readings
- **Optional login** (Supabase) to save preferences and log sessions
- **Session-aware ranking** when you log past sessions with ratings
- **Add custom spots** via LLM-generated break configuration + marine calibration
- **AI coach** (on-demand): recommendation using scores, hourly forecasts, and session history

---

## How to use

1. Open [surf-project-sable.vercel.app](https://surf-project-sable.vercel.app/).
2. Set your skill level, quiver, and start location, then click **Fetch conditions**.
3. Use the sidebar to browse spots ranked by score; click a spot to view its forecast.
4. Hover the surf and tide charts to see synced hourly detail.
5. Switch **Yesterday / Today / Tomorrow** to compare forecast days.
6. *(Optional)* Log in to save preferences, log sessions, and boost spots you have rated highly in similar conditions.
7. *(Optional)* Click **Generate recommendation** for an AI coach write-up, or **Add spot** to configure a custom break.

---

## Local development

**Prerequisites:** Node.js 18+ and API keys in `.env.local` (copy from `.env.example`).

```bash
git clone https://github.com/Hylton777/surf-project.git
cd surf-project
cp .env.example .env.local
npm install
npm run dev
```

Required keys for full functionality: Cloudflare Workers AI (or Anthropic), TomTom (drive times). Supabase is optional for login and saved preferences — run `supabase/user_profiles.sql` and `supabase/surf_sessions.sql` in your Supabase SQL editor if you enable auth.

```bash
npm test          # unit + integration smoke tests
npm run build
```

---

## Evaluation & evidence

### Automated testing

Run `npm test` (80 checks total).

**Unit tests (75)** — Fast offline checks on the core logic: surf height and scoring math, buoy parsing, wind/tide scoring, session-based ranking, and AI prompt formatting. They use fixed sample data, not the live internet.

**Smoke tests (5)** — A quick end-to-end check: fetch real forecast data for all 8 spots, build scores, and render the main screens (setup, dashboard, charts) without crashing. They also catch missing imports in React files, which caused blank-page bugs after a refactor.

### User feedback

"Excellent app and I really liked the explanations behind the AI recommendations which felt as if a local surfer was giving you the advice. My favourite feature is that I can log the board that I used in each session to personalise my recommendations which was unlike any other forecasting app I've used before. However, I do think that some of the AI suggestions were unrealistic e.g. 3am being the recommended best time for a certain location to go and surf. So just humanising the response slightly would be useful. " - Tom C, Stanford Surfer

Response: In response to Tom's feedback, the prompt used to generate the AI recommendation was changed so that surfers should not be recommended to surf during the night.

"The surf score is a great feature; I like the added precision of a numerical score compared to the rating labels given by other surf forecasters. The choice of 8 spots is a bit limiting, but it captures the best spots of the Bay Area and the option to add a spot means I can check out the forecast anywhere I might be thinking about surfing. I love being able to log my sessions and think it's cool to be able to look back at the sessions I have done and know that these are contributing towards better recommendations next time I surf." - James P, Santa Cruz Surfer

Response: For now, Surf Intel focuses on the Bay Area, aiming to generate accurate surf reports and act as a powerful surf advisor. In the future we hope to be able to expand so that users can see the nearest spots to them automatically, without having to add them manually.

"I found Surf Intel to be incredibly useful when it comes to making decisions around my next surf. In particular, matching the conditions to my quiver took the guesswork out. While I haven't been able to use the deeper features like logging my sessions yet, I worry that overcomplicating the analysis of conditions could lead to less surfing. Any day I get to surf is a good day. If Surf Intel helps me do that, great!" - Callen B, San Francisco Surfer

### Limitations noted in feedback

Surfers who tested Surf Intel noted that sometimes the AI recommendation can sound like it is trying too hard to use surfer lingo; this is something we are working on refining. Some expressed that ratings appeared to be too low, feeling that the conditions were not as bad as forecasted at a certain spot; we have tuned this extensively and feel that the current scoring system is an accurate reflection of the conditions at our spots. 

---

## AI usage disclosure


| Tool                                       | Role                                                                                                                                  |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| **[Cursor](https://cursor.com/)**          | Primary IDE; AI-assisted coding, refactoring, debugging, and test writing                                                             |
| **[Factory](https://factory.ai/)**         | Additional AI-assisted development workflows                                                                                          |
| **[Claude](https://anthropic.com/claude)** | Extensive brainstorming for features and product direction; provided the **initial framework** for the website and early architecture |


The author owns and iterated on the surf scoring model, per-spot configs, forecast blending (Open-Meteo + NDBC), product flow, session-aware ranking, tests, and deployment. AI-assisted code was reviewed, debugged, and validated before submission.

---

## Credits & data sources


| Source                                                                                                                                                                         | Use                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| [Open-Meteo Marine API](https://open-meteo.com/)                                                                                                                               | Swell / wave hourly data                               |
| [Open-Meteo Forecast API](https://open-meteo.com/)                                                                                                                             | Wind hourly data                                       |
| [NOAA CO-OPS](https://tidesandcurrents.noaa.gov/)                                                                                                                              | Tide predictions                                       |
| [NDBC NOAA](https://www.ndbc.noaa.gov/)                                                                                                                                        | Buoy spectral summaries                                |
| [TomTom Routing API](https://developer.tomtom.com/)                                                                                                                            | Drive times                                            |
| [Cloudflare Workers AI](https://developers.cloudflare.com/workers-ai/) — [Llama 3.1 70B Instruct](https://developers.cloudflare.com/workers-ai/models/llama-3.1-70b-instruct/) | AI coach recommendations and custom spot configuration |
| [Supabase](https://supabase.com/)                                                                                                                                              | Auth & Postgres                                        |
| [React](https://react.dev/) + [Vite](https://vitejs.dev/)                                                                                                                      | Frontend                                               |


