const parseJsonObjectFromText = text => {
  const t = String(text || "").trim();
  if (!t) return null;
  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced ? fenced[1].trim() : t;
  const objMatch = raw.match(/\{[\s\S]*\}/);
  if (!objMatch) return null;
  try {
    return JSON.parse(objMatch[0]);
  } catch {
    return null;
  }
};

const toSlug = value =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
export { parseJsonObjectFromText, toSlug };

