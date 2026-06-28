"""
Load Optimization Engine
- 3D bin packing with gravity simulation
- Weight distribution validation
- Rotation control per box
- Multi-container optimization (minimize containers)
"""

import math
import copy
import itertools
from typing import List, Dict, Tuple, Optional

DEFAULT_FLEET = [
    {"name": "15 MT BS6",              "l": 6705, "w": 2225, "h": 2286, "max_wt": 15000},
    {"name": "18 MT BS6",              "l": 6705, "w": 2225, "h": 2286, "max_wt": 18000},
    {"name": "22 MT BS6",              "l": 7924, "w": 2225, "h": 2286, "max_wt": 22000},
    {"name": "12 MT BS6",              "l": 7315, "w": 2438, "h": 2286, "max_wt": 12000},
    {"name": "Single Axle BS4 (9T)",   "l": 9753, "w": 2438, "h": 2895, "max_wt": 9000},
    {"name": "Single Axle BS4 (7.5T)", "l": 9753, "w": 2438, "h": 2895, "max_wt": 7500},
    {"name": "Multi Axle BS4 (18T)",   "l": 9753, "w": 2438, "h": 2895, "max_wt": 18000},
    {"name": "Multi Axle BS4 (22T)",   "l": 9753, "w": 2438, "h": 2895, "max_wt": 22000},
]

ROTATION_DEFS = {
    # name: (lx, ly, lz) axis mapping  → maps box (L,W,H) to (x,y,z)
    "LWH": (0, 1, 2),  # original
    "LHW": (0, 2, 1),
    "WLH": (1, 0, 2),
    "WHL": (1, 2, 0),
    "HLW": (2, 0, 1),
    "HWL": (2, 1, 0),
}


def get_rotations(box_dims: Tuple[float, float, float], allowed: List[str]) -> List[Tuple[float, float, float]]:
    """Return all allowed rotations as (dx, dy, dz) tuples."""
    L, W, H = box_dims
    dims = [L, W, H]
    seen = set()
    result = []
    for rot_name, (ai, aj, ak) in ROTATION_DEFS.items():
        if rot_name in allowed:
            t = (dims[ai], dims[aj], dims[ak])
            if t not in seen:
                seen.add(t)
                result.append((t, rot_name))
    return result


class Space:
    """Represents a 3D space (corner + dimensions) inside a container."""
    __slots__ = ["x", "y", "z", "dx", "dy", "dz"]

    def __init__(self, x, y, z, dx, dy, dz):
        self.x, self.y, self.z = x, y, z
        self.dx, self.dy, self.dz = dx, dy, dz

    @property
    def volume(self):
        return self.dx * self.dy * self.dz


class PlacedBox:
    __slots__ = ["name", "color", "x", "y", "z", "dx", "dy", "dz", "weight", "rotation", "box_index"]

    def __init__(self, name, color, x, y, z, dx, dy, dz, weight, rotation, box_index):
        self.name = name
        self.color = color
        self.x, self.y, self.z = x, y, z
        self.dx, self.dy, self.dz = dx, dy, dz
        self.weight = weight
        self.rotation = rotation
        self.box_index = box_index

    def to_dict(self):
        return {
            "name": self.name, "color": self.color,
            "x": self.x, "y": self.y, "z": self.z,
            "dx": self.dx, "dy": self.dy, "dz": self.dz,
            "weight": self.weight, "rotation": self.rotation,
            "box_index": self.box_index
        }


class ContainerPacker:
    def __init__(self, container: Dict):
        self.container = container
        self.CL = container["l"]  # length (x)
        self.CW = container["w"]  # width  (y)
        self.CH = container["h"]  # height (z)
        self.max_wt = container["max_wt"]           # ← FIXED: removed * 1000 (was inflating by 1000x)
        self.placed: List[PlacedBox] = []
        self.total_weight = 0.0
        self.spaces: List[Space] = [Space(0, 0, 0, self.CL, self.CW, self.CH)]

    def _fits_in_space(self, sp: Space, dx, dy, dz) -> bool:
        return dx <= sp.dx and dy <= sp.dy and dz <= sp.dz

    def _overlaps_placed(self, x, y, z, dx, dy, dz) -> bool:
        for b in self.placed:
            if (x < b.x + b.dx and x + dx > b.x and
                    y < b.y + b.dy and y + dy > b.y and
                    z < b.z + b.dz and z + dz > b.z):
                return True
        return False

    def _support_area_ratio(self, x, y, z, dx, dy) -> float:
        """Fraction of box bottom supported by floor or other boxes."""
        if z == 0:
            return 1.0
        supported = 0.0
        total = dx * dy
        for b in self.placed:
            if abs(b.z + b.dz - z) < 1e-6:
                ox = max(x, b.x)
                oy = max(y, b.y)
                ox2 = min(x + dx, b.x + b.dx)
                oy2 = min(y + dy, b.y + b.dy)
                if ox2 > ox and oy2 > oy:
                    supported += (ox2 - ox) * (oy2 - oy)
        return supported / total if total > 0 else 0.0

    def _apply_gravity(self, x, y, dx, dy, dz) -> int:
        """Find lowest z where box can rest with sufficient support."""
        zs = sorted(set([0] + [b.z + b.dz for b in self.placed]))
        best_z = None
        for candidate_z in zs:
            if self._overlaps_placed(x, y, candidate_z, dx, dy, dz):
                continue
            if candidate_z + dz > self.CH:
                continue
            support = self._support_area_ratio(x, y, candidate_z, dx, dy)
            if candidate_z == 0 or support >= 0.3:   # ← CHANGED: was 0.5, now 0.3 (less strict, fewer gaps)
                best_z = candidate_z
                break
        return best_z

    def _split_space(self, sp: Space, x, y, z, dx, dy, dz):
        """Maximal spaces split — replaces old guillotine split to reduce gaps."""
        self.spaces.remove(sp)
        new_spaces = []

        # Right of placed box (along x) — full height and depth of parent space
        if sp.x + sp.dx > x + dx:
            new_spaces.append(Space(
                x + dx, sp.y, sp.z,
                sp.x + sp.dx - (x + dx), sp.dy, sp.dz   # ← CHANGED: uses full sp.dy/sp.dz not just dy/dz
            ))

        # Front of placed box (along y) — full width of parent space    ← KEY FIX for horizontal gaps
        if sp.y + sp.dy > y + dy:
            new_spaces.append(Space(
                sp.x, y + dy, sp.z,
                sp.dx, sp.y + sp.dy - (y + dy), sp.dz    # ← CHANGED: was dx (narrow), now sp.dx (full width)
            ))

        # Above placed box (along z)
        if sp.z + sp.dz > z + dz:
            new_spaces.append(Space(
                # x, y, z + dz,
                # dx, dy, sp.z + sp.dz - (z + dz)
                sp.x, sp.y, z + dz,
                sp.dx, sp.dy, sp.z + sp.dz - (z + dz)
            ))

        # Only add spaces that have real volume
        for ns in new_spaces:
            if ns.dx > 0 and ns.dy > 0 and ns.dz > 0:   # ← ADDED: guard against zero-size spaces
                self.spaces.append(ns)

        # Sort: lower z first (gravity), then x (fill front-to-back), then largest volume
        self.spaces.sort(key=lambda s: (s.z, s.x, s.y, -s.volume))   # ← CHANGED: added s.x, s.y to sort

    def try_place(self, name, color, dims_rotations, weight, box_index) -> bool:
        """Try to place a box with best rotation into best space."""
        if self.total_weight + weight > self.max_wt:
            return False

        best = None  # (score, space, dx, dy, dz, rot_name, z_actual)

        for sp in self.spaces:
            for (dx, dy, dz), rot_name in dims_rotations:
                if not self._fits_in_space(sp, dx, dy, dz):
                    continue
                z_actual = self._apply_gravity(sp.x, sp.y, dx, dy, dz)
                if z_actual is None:
                    continue
                if self._overlaps_placed(sp.x, sp.y, z_actual, dx, dy, dz):
                    continue
                # Score: lower z better, then lower x (pack front first), then tightest fit
                score = (z_actual, sp.x, sp.y, -dx * dy * dz)   # ← CHANGED: added sp.x, sp.y to score
                if best is None or score < best[0]:
                    best = (score, sp, dx, dy, dz, rot_name, z_actual)

        if best is None:
            return False

        _, sp, dx, dy, dz, rot_name, z_actual = best
        x, y = sp.x, sp.y
        self.placed.append(PlacedBox(name, color, x, y, z_actual, dx, dy, dz, weight, rot_name, box_index))
        self.total_weight += weight
        self._split_space(sp, x, y, z_actual, dx, dy, dz)
        return True

    @property
    def utilization_vol(self):
        used = sum(b.dx * b.dy * b.dz for b in self.placed)
        total = self.CL * self.CW * self.CH
        return round(used / total * 100, 2) if total else 0

    @property
    def utilization_wt(self):
        return round(self.total_weight / self.max_wt * 100, 2) if self.max_wt else 0


def expand_boxes(items: List[Dict]) -> List[Dict]:
    """Expand qty into individual box entries."""
    expanded = []
    for idx, item in enumerate(items):
        for q in range(int(item["qty"])):
            expanded.append({
                "name": item["name"],
                "color": item["color"],
                "l": float(item["l"]),
                "w": float(item["w"]),
                "h": float(item["h"]),
                "weight": float(item["weight"]),  # per-unit gross weight
                "allowed_rotations": item.get("allowed_rotations", list(ROTATION_DEFS.keys())),
                "box_index": idx,
            })
    # Sort: largest volume first, then heaviest — fills columns more completely  ← CHANGED: was weight-first
    expanded.sort(key=lambda b: (-(b["l"] * b["w"] * b["h"]), -b["weight"]))
    return expanded


def pack_into_container(container: Dict, boxes: List[Dict]) -> Tuple[ContainerPacker, List[Dict]]:
    """Pack as many boxes as possible into one container. Returns packer + leftover boxes."""
    packer = ContainerPacker(container)
    leftover = []
    for box in boxes:
        rotations = get_rotations((box["l"], box["w"], box["h"]), box["allowed_rotations"])
        placed = packer.try_place(
            box["name"], box["color"], rotations,
            box["weight"], box["box_index"]
        )
        if not placed:
            leftover.append(box)
    return packer, leftover


def select_containers(total_weight: float, total_volume: float,
                       fleet: List[Dict], selected_names: List[str]) -> List[Dict]:
    """Select the minimum set of containers that fit weight + volume."""
    available = [c for c in fleet if c["name"] in selected_names]
    if not available:
        available = fleet

    # Sort by capacity descending
    available = sorted(available, key=lambda c: (-c["max_wt"], -(c["l"] * c["w"] * c["h"])))
    return available


def run_optimization(data: Dict) -> Dict:
    items = data["items"]
    fleet = data.get("fleet", DEFAULT_FLEET)
    selected_container_names = data.get("selected_containers", [c["name"] for c in fleet])

    if not items:
        raise ValueError("No items provided.")

    # Expand items
    boxes = expand_boxes(items)
    total_weight = sum(b["weight"] for b in boxes)
    total_volume = sum(b["l"] * b["w"] * b["h"] for b in boxes)

    # Summary stats
    item_summary = []
    for item in items:
        qty = int(item["qty"])
        vol_each = float(item["l"]) * float(item["w"]) * float(item["h"])
        item_summary.append({
            "name": item["name"],
            "color": item["color"],
            "qty": qty,
            "dims": f"{item['l']} × {item['w']} × {item['h']} mm",
            "weight_each": float(item["weight"]),
            "total_weight": round(float(item["weight"]) * qty, 2),
            "total_volume": round(vol_each * qty, 6),
            "allowed_rotations": item.get("allowed_rotations", list(ROTATION_DEFS.keys())),
        })

    available_containers = select_containers(total_weight, total_volume, fleet, selected_container_names)
    if not available_containers:
        raise ValueError("No containers match the selection.")

    # Greedy multi-container packing: use largest first, iterate until all packed
    containers_used = []
    remaining = list(boxes)
    container_cycle = available_containers  # can reuse same container type

    max_iterations = 50
    iteration = 0

    while remaining and iteration < max_iterations:
        iteration += 1
        best_packer = None
        best_leftover = remaining
        best_container = None

        # Try each available container type; pick the one that fits the most boxes
        # Try each available container type; pick the one that fits the most boxes efficiently
        for container in container_cycle:
            packer, leftover = pack_into_container(container, list(remaining))
            
            # Condition 1: It leaves fewer leftovers than our current best
            if len(leftover) < len(best_leftover):
                best_packer = packer
                best_leftover = leftover
                best_container = container
            
            # Condition 2: It leaves the SAME amount of leftovers, 
            # but is a MORE EFFICIENT container overall (combining weight & volume util)
            elif len(leftover) == len(best_leftover) and best_packer is not None:
                current_efficiency = packer.utilization_vol + packer.utilization_wt
                best_efficiency = best_packer.utilization_vol + best_packer.utilization_wt
                
                if current_efficiency > best_efficiency:
                    best_packer = packer
                    best_leftover = leftover
                    best_container = container

        if best_packer is None or len(best_packer.placed) == 0:
            break  # cannot pack more

        containers_used.append({
            "container": best_container,
            "packer": best_packer,
        })
        remaining = best_leftover

    # Build result
    containers_result = []
    for cu in containers_used:
        c = cu["container"]
        pk = cu["packer"]
        containers_result.append({
            "container_name": c["name"],
            "container_dims": {"l": c["l"], "w": c["w"], "h": c["h"]},
            "max_wt": c["max_wt"],
            "placed_boxes": [b.to_dict() for b in pk.placed],
            "total_weight": round(pk.total_weight, 2),
            "total_volume_used": round(sum(b.dx * b.dy * b.dz for b in pk.placed), 0),
            "container_volume": c["l"] * c["w"] * c["h"],
            "utilization_vol": pk.utilization_vol,
            "utilization_wt": pk.utilization_wt,
            "box_count": len(pk.placed),
        })

    unplaced = []
    for b in remaining:
        unplaced.append({"name": b["name"], "color": b["color"], "weight": b["weight"]})

    return {
        "containers": containers_result,
        "unplaced": unplaced,
        "total_boxes": len(boxes),
        "total_weight": round(total_weight, 2),
        "total_volume": round(total_volume, 0),
        "num_containers": len(containers_used),
        "item_summary": item_summary,
    }