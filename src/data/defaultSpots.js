const SPOTS = [
  { id: "ob", name: "Ocean Beach", shortName: "OB", lat: 37.7594, lon: -122.5107, type: "Beach Break", difficulty: "Intermediate", city: "San Francisco", tideStationId: "9414290", tideStationLabel: "San Francisco (Golden Gate)" },
  { id: "linda_mar", name: "Linda Mar", shortName: "Linda Mar", lat: 37.5841, lon: -122.4994, type: "Beach Break", difficulty: "Beginner–Inter", city: "Pacifica", tideStationId: "9414290", tideStationLabel: "San Francisco (Golden Gate)" },
  { id: "bolinas", name: "Bolinas", shortName: "Bolinas", lat: 37.9074, lon: -122.7174, type: "Point Break", difficulty: "Intermediate", city: "Marin", tideStationId: "9414958", tideStationLabel: "Bolinas Lagoon" },
  { id: "steamer_lane", name: "Steamer Lane", shortName: "Steamer Lane", lat: 36.9514, lon: -122.0267, type: "Point Break", difficulty: "Intermediate", city: "Santa Cruz", tideStationId: "9413745", tideStationLabel: "Santa Cruz, Monterey Bay" },
  { id: "montara", name: "Montara", shortName: "Montara", lat: 37.5396, lon: -122.5167, type: "Beach Break", difficulty: "Intermediate", city: "Montara", tideStationId: "9414131", tideStationLabel: "Pillar Point Harbor" },
  { id: "hmb_surfers_beach", name: "Half Moon Bay (Surfers' Beach)", shortName: "Surfers' Beach", lat: 37.5038, lon: -122.4837, type: "Beach Break", difficulty: "Beginner–Inter", city: "Half Moon Bay", tideStationId: "9414131", tideStationLabel: "Pillar Point Harbor" },
  { id: "mavs", name: "Mavericks", shortName: "Mavs", lat: 37.4953, lon: -122.5003, type: "Reef Break", difficulty: "Expert Only", city: "Half Moon Bay", tideStationId: "9414131", tideStationLabel: "Pillar Point Harbor" },
  { id: "pleasure_point", name: "Pleasure Point", shortName: "Pleasure Point", lat: 36.9569, lon: -121.9817, type: "Point Break", difficulty: "Intermediate", city: "Santa Cruz", tideStationId: "9413745", tideStationLabel: "Santa Cruz, Monterey Bay" },
];

const BOARDS = [
  { id: "longboard", name: "Longboard", size: '9\'0"+', desc: "Easy paddle, smooth cruising" },
  { id: "funboard", name: "Funboard", size: "7\'–8\'6\"", desc: "Versatile all-rounder" },
  { id: "mid_length", name: "Mid-length", size: "6\'6\"–8\'0\"", desc: "Modern cruiser" },
  { id: "fish", name: "Fish", size: "5\'4\"–6\'4\"", desc: "Small wave machine" },
  { id: "shortboard", name: "Shortboard", size: "5\'8\"–6\'6\"", desc: "Performance surfing" },
  { id: "gun", name: "Gun / Step-up", size: "7\'0\"+", desc: "For serious swell" },
];

const SKILLS = ["Beginner", "Intermediate", "Advanced", "Expert"];
export { SPOTS, BOARDS, SKILLS };

