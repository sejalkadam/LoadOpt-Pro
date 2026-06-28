// constants.js — Fleet and rotation definitions

const DEFAULT_FLEET = [
  { name: "15 MT BS6",              l: 6705, w: 2225, h: 2286, max_wt: 15000 },
  { name: "18 MT BS6",              l: 6705, w: 2225, h: 2286, max_wt: 18000 },
  { name: "22 MT BS6",              l: 7924, w: 2225, h: 2286, max_wt: 22000 },
  { name: "12 MT BS6",              l: 7315, w: 2438, h: 2286, max_wt: 12000 },
  { name: "Single Axle BS4 (9T)",   l: 9753, w: 2438, h: 2895, max_wt: 9000  },
  { name: "Single Axle BS4 (7.5T)", l: 9753, w: 2438, h: 2895, max_wt: 7500  },
  { name: "Multi Axle BS4 (18T)",   l: 9753, w: 2438, h: 2895, max_wt: 18000 },
  { name: "Multi Axle BS4 (22T)",   l: 9753, w: 2438, h: 2895, max_wt: 22000 },
];

const ROTATIONS = [
  { id: "LWH", label: "LWH", icon: "📦", sub: "Original",      desc: "L→X  W→Y  H→Z" },
  { id: "LHW", label: "LHW", icon: "🔄", sub: "Flip Height",   desc: "L→X  H→Y  W→Z" },
  { id: "WLH", label: "WLH", icon: "↻",  sub: "Rotate 90°",   desc: "W→X  L→Y  H→Z" },
  { id: "WHL", label: "WHL", icon: "⟳",  sub: "Width Fwd",    desc: "W→X  H→Y  L→Z" },
  { id: "HLW", label: "HLW", icon: "↕",  sub: "Stand Tall",   desc: "H→X  L→Y  W→Z" },
  { id: "HWL", label: "HWL", icon: "🔃", sub: "Height Fwd",   desc: "H→X  W→Y  L→Z" },
];

// Pretty color palette for new boxes
const BOX_COLORS = [
  "#4A90D9","#E8703A","#27AE60","#9B59B6","#E91E8C",
  "#16A085","#F39C12","#2980B9","#8E44AD","#C0392B",
  "#1ABC9C","#D35400","#2C3E50","#27AE60","#2E86DE",
];
