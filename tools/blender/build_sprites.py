"""Render the Bridgehold sprite set from procedural Blender geometry.

Everything the bridge draws is modelled here from primitives, lit once for a
night scene (cold moon key, warm lantern fill), and rendered with a tilted
orthographic camera that matches the lane's top-down-and-slightly-behind view.
The squad faces up the lane, away from the camera; every enemy faces down it.

    blender -b -noaudio --python tools/blender/build_sprites.py -- --out assets/sprites

or, with Blender installed as a Python module,

    python3 tools/blender/build_sprites.py --out assets/sprites

Output is one PNG per part plus manifest.json. Every sprite is square and the
ground point of its subject sits at the image centre, so the runtime draws a
sprite centred on the unit's position and scales it by `pixelsPerUnit`.
"""

import json
import math
import os
import sys

import bpy

# ---------------------------------------------------------------- arguments

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
OUT = os.path.abspath(argv[argv.index("--out") + 1] if "--out" in argv else "assets/sprites")
ONLY = argv[argv.index("--only") + 1].split(",") if "--only" in argv else None
SAMPLES = int(argv[argv.index("--samples") + 1] if "--samples" in argv else 96)
os.makedirs(OUT, exist_ok=True)

# Camera tilt from straight down. 0 would be a map; 90 a side view. The lane
# is drawn as if seen from a little behind the squad, so 52 reads as "over the
# shoulder of the line" while keeping feet and heads apart.
TILT = 52.0

MANIFEST = {"tilt": TILT, "parts": {}}
if ONLY:
    try:
        with open(os.path.join(OUT, "manifest.json")) as _f:
            MANIFEST["parts"] = json.load(_f).get("parts", {})
    except (OSError, ValueError):
        pass


# ------------------------------------------------------------------- helpers

_materials = {}


def clear():
    _materials.clear()
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.lights, bpy.data.cameras):
        for item in list(block):
            if item.users == 0:
                block.remove(item)


def _set(bsdf, names, value):
    for n in names:
        if n in bsdf.inputs:
            bsdf.inputs[n].default_value = value
            return


def mat(name, color, metallic=0.1, roughness=0.55, emission=None, strength=0.0, alpha=1.0, transmission=0.0, ior=1.45):
    key = (name, color, metallic, roughness, emission, strength, alpha, transmission, ior)
    if key in _materials:
        return _materials[key]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    _set(bsdf, ["IOR"], ior)
    if emission:
        _set(bsdf, ["Emission Color", "Emission"], (*emission, 1.0))
        _set(bsdf, ["Emission Strength"], strength)
    if alpha < 1.0:
        bsdf.inputs["Alpha"].default_value = alpha
    if transmission > 0:
        _set(bsdf, ["Transmission Weight", "Transmission"], transmission)
    _materials[key] = m
    return m


def finish(obj, material, bevel=0.012, smooth=False):
    if material is not None:
        obj.data.materials.append(material)
    if bevel:
        b = obj.modifiers.new("bevel", "BEVEL")
        b.width = bevel
        b.segments = 3
        b.limit_method = "ANGLE"
        b.angle_limit = math.radians(40)
    if smooth:
        bpy.ops.object.shade_smooth()
    return obj


def box(size, loc=(0, 0, 0), rot=(0, 0, 0), material=None, bevel=0.014):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.object
    o.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(o, material, bevel)


def cyl(r, h, loc=(0, 0, 0), rot=(0, 0, 0), verts=24, material=None, bevel=0.01):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=h, location=loc, rotation=rot)
    return finish(bpy.context.object, material, bevel, smooth=True)


def ball(r, loc=(0, 0, 0), material=None, scale=(1, 1, 1), segments=24):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=loc, segments=segments, ring_count=segments // 2)
    o = bpy.context.object
    o.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(o, material, 0, smooth=True)


def cone(r1, r2, h, loc=(0, 0, 0), rot=(0, 0, 0), material=None, verts=24):
    bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r1, radius2=r2, depth=h, location=loc, rotation=rot)
    return finish(bpy.context.object, material, 0.008, smooth=True)


# --------------------------------------------------------------------- scene

def setup_scene(ortho):
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = SAMPLES
    scene.cycles.use_denoising = False
    scene.cycles.use_adaptive_sampling = True
    scene.cycles.adaptive_threshold = 0.02
    scene.cycles.max_bounces = 6
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.compression = 90
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.view_settings.exposure = -0.2

    # A thin dark contour so the renders sit on the flat-shaded deck as
    # drawings rather than as photographs.
    try:
        scene.render.use_freestyle = True
        scene.render.line_thickness = 1.1
        vl = scene.view_layers[0]
        vl.use_freestyle = True
        fs = vl.freestyle_settings
        fs.crease_angle = math.radians(128)
        if not fs.linesets:
            fs.linesets.new("outline")
        ls = fs.linesets[0]
        ls.select_silhouette = True
        ls.select_border = True
        ls.select_crease = True
        ls.linestyle.color = (0.03, 0.04, 0.08)
        ls.linestyle.thickness = 1.1
    except Exception as exc:  # freestyle is optional in some module builds
        print("freestyle unavailable:", exc)

    world = scene.world or bpy.data.worlds.new("night")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (0.05, 0.08, 0.16, 1.0)
    bg.inputs[1].default_value = 0.35

    # Camera: orthographic, tilted, aimed at the ground origin so the subject's
    # contact point lands at the image centre.
    cam_data = bpy.data.cameras.new("cam")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = ortho
    cam_data.clip_start = 0.1
    cam_data.clip_end = 100
    cam = bpy.data.objects.new("cam", cam_data)
    bpy.context.collection.objects.link(cam)
    t = math.radians(TILT)
    dist = 20.0
    cam.location = (0.0, -math.sin(t) * dist, math.cos(t) * dist)
    cam.rotation_euler = (t, 0.0, 0.0)
    scene.camera = cam

    def light(kind, name, loc, energy, color, size=3.0, rot=None):
        data = bpy.data.lights.new(name, kind)
        data.energy = energy
        data.color = color
        if kind == "AREA":
            data.size = size
        if kind == "SUN":
            data.angle = math.radians(4)
        o = bpy.data.objects.new(name, data)
        o.location = loc
        if rot:
            o.rotation_euler = rot
        else:
            d = -o.location.normalized() if hasattr(o.location, "normalized") else None
            o.rotation_euler = _aim(loc)
        bpy.context.collection.objects.link(o)
        return o

    # Moon key from high front-left, cold. Lantern fill from low behind the
    # camera, warm, so the squad's backs and every enemy's face pick up amber.
    light("SUN", "moon", (-6, 4, 12), 3.4, (0.80, 0.88, 1.0))
    light("AREA", "lantern", (2.5, -6, 3.5), 420, (1.0, 0.74, 0.42), size=5)
    light("AREA", "rim", (5, 7, 6), 500, (0.55, 0.85, 1.0), size=4)

    # Shadow catcher: a ground plane that renders only the shadow it receives.
    bpy.ops.mesh.primitive_plane_add(size=ortho * 3, location=(0, 0, 0))
    ground = bpy.context.object
    ground.is_shadow_catcher = True
    gm = bpy.data.materials.new("catcher")
    gm.use_nodes = True
    ground.data.materials.append(gm)


def _aim(loc):
    """Euler rotation that points an object at the origin from `loc`."""
    x, y, z = loc
    from mathutils import Vector
    direction = Vector((-x, -y, -z))
    return direction.to_track_quat("-Z", "Y").to_euler()


def render(name, resolution, ortho, note):
    scene = bpy.context.scene
    scene.render.resolution_x = resolution
    scene.render.resolution_y = resolution
    scene.render.resolution_percentage = 100
    scene.render.filepath = os.path.join(OUT, name + ".png")
    bpy.ops.render.render(write_still=True)
    MANIFEST["parts"][name] = {
        "file": name + ".png",
        "size": resolution,
        "pixelsPerUnit": round(resolution / ortho, 3),
        "note": note,
    }
    print("rendered", name)


def build(name, resolution, ortho, fn, note=""):
    if ONLY and name not in ONLY:
        return
    clear()
    setup_scene(ortho)
    fn()
    render(name, resolution, ortho, note)


# -------------------------------------------------------------------- models
# Units are metres-ish: a soldier is 1.7 tall. +Y is up the lane.

NAVY = (0.10, 0.22, 0.52)
NAVY_D = (0.07, 0.14, 0.34)
AMBER = (0.95, 0.58, 0.18)
SKIN = (0.98, 0.80, 0.62)
GUN = (0.08, 0.09, 0.12)
HUSK = (0.40, 0.62, 0.42)
HUSK_D = (0.22, 0.18, 0.24)
RUNNER = (0.70, 0.56, 0.36)
BRUTE = (0.34, 0.22, 0.62)
BRUTE_D = (0.14, 0.09, 0.26)
OLIVE = (0.36, 0.44, 0.26)
OLIVE_D = (0.17, 0.21, 0.13)


def legs(y_off, stride, r=0.09, h=0.6, color=NAVY_D, spread=0.14, z=0.3):
    """Two legs, one swung forward by `stride` along Y."""
    m = mat("legs", color, roughness=0.7)
    cyl(r, h, loc=(-spread, y_off + stride, z), material=m)
    cyl(r, h, loc=(spread, y_off - stride, z), material=m)


def soldier(frame):
    stride = 0.12 if frame == 0 else -0.12
    legs(0, stride)
    torso = mat("coat", NAVY, roughness=0.6)
    box((0.5, 0.32, 0.62), loc=(0, 0, 0.91), material=torso)
    vest = mat("vest", AMBER, roughness=0.5)
    box((0.42, 0.14, 0.42), loc=(0, -0.12, 0.92), material=vest)   # back plate (faces camera)
    box((0.42, 0.14, 0.42), loc=(0, 0.12, 0.92), material=vest)
    # backpack, lantern
    box((0.3, 0.16, 0.34), loc=(0, -0.26, 0.98), material=mat("pack", NAVY_D, roughness=0.8))
    ball(0.07, loc=(0.2, -0.3, 0.8), material=mat("lantern", (1, 0.7, 0.3), emission=(1.0, 0.62, 0.2), strength=14))
    ball(0.17, loc=(0, 0, 1.4), material=mat("skin", SKIN, roughness=0.6))
    # helmet
    ball(0.2, loc=(0, 0, 1.46), material=mat("helmet", NAVY_D, roughness=0.45), scale=(1, 1, 0.75))
    # arms forward holding the rifle
    arm = mat("arm", NAVY, roughness=0.6)
    cyl(0.07, 0.5, loc=(-0.3, 0.2, 1.0), rot=(math.radians(90), 0, 0), material=arm)
    cyl(0.07, 0.5, loc=(0.3, 0.2, 1.0), rot=(math.radians(90), 0, 0), material=arm)
    # rifle, pointing up the lane
    g = mat("gun", GUN, metallic=0.6, roughness=0.35)
    cyl(0.045, 1.0, loc=(0.18, 0.55, 1.05), rot=(math.radians(90), 0, 0), material=g)
    box((0.1, 0.34, 0.16), loc=(0.18, 0.2, 1.0), material=g)


def muzzle():
    """A flash the runtime blends over the rifle tip on firing frames."""
    f = mat("flash", (1, 0.85, 0.5), emission=(1.0, 0.75, 0.3), strength=40)
    cone(0.0, 0.22, 0.5, loc=(0, 0.2, 0.6), rot=(math.radians(-90), 0, 0), material=f)
    ball(0.16, loc=(0, 0, 0.6), material=f)


def husk(frame):
    stride = 0.14 if frame == 0 else -0.14
    legs(0, stride, r=0.08, h=0.5, color=HUSK_D, spread=0.13, z=0.25)
    body = mat("husk", HUSK, roughness=0.8)
    # hunched, leaning toward the camera (down the lane)
    ball(0.34, loc=(0, -0.05, 0.82), material=body, scale=(1, 0.8, 1.05))
    box((0.5, 0.2, 0.36), loc=(0, 0.02, 0.62), material=mat("rags", HUSK_D, roughness=0.9))
    ball(0.2, loc=(0, -0.22, 1.18), material=body)
    eye = mat("eye", (1, 0.2, 0.25), emission=(1.0, 0.18, 0.25), strength=18)
    ball(0.035, loc=(-0.07, -0.4, 1.2), material=eye)
    ball(0.035, loc=(0.07, -0.4, 1.2), material=eye)
    # arms reaching forward (toward the line)
    arm = mat("husk_arm", HUSK, roughness=0.8)
    cyl(0.06, 0.55, loc=(-0.28, -0.32, 0.95), rot=(math.radians(-80), 0, 0), material=arm)
    cyl(0.06, 0.55, loc=(0.28, -0.3, 0.9), rot=(math.radians(-80), 0, 0), material=arm)


def runner(frame):
    stride = 0.26 if frame == 0 else -0.26
    legs(0, stride, r=0.06, h=0.7, color=(0.45, 0.36, 0.26), spread=0.1, z=0.35)
    body = mat("runner", RUNNER, roughness=0.75)
    # leaning hard forward
    ball(0.22, loc=(0, -0.12, 0.95), material=body, scale=(0.9, 1.4, 1.0))
    ball(0.15, loc=(0, -0.42, 1.12), material=body)
    eye = mat("reye", (1, 0.2, 0.25), emission=(1.0, 0.18, 0.25), strength=18)
    ball(0.03, loc=(-0.05, -0.56, 1.14), material=eye)
    ball(0.03, loc=(0.05, -0.56, 1.14), material=eye)
    arm = mat("rarm", RUNNER, roughness=0.75)
    cyl(0.045, 0.5, loc=(-0.2, -0.1 - stride * 0.6, 0.95), rot=(math.radians(-60), 0, 0), material=arm)
    cyl(0.045, 0.5, loc=(0.2, -0.1 + stride * 0.6, 0.95), rot=(math.radians(-60), 0, 0), material=arm)


def brute(frame):
    stride = 0.1 if frame == 0 else -0.1
    legs(0, stride, r=0.16, h=0.7, color=BRUTE_D, spread=0.3, z=0.35)
    body = mat("brute", BRUTE, roughness=0.7)
    plate = mat("plate", BRUTE_D, metallic=0.3, roughness=0.5)
    box((1.1, 0.7, 0.9), loc=(0, 0, 1.15), material=body)
    box((1.2, 0.2, 0.6), loc=(0, 0.36, 1.25), material=plate)   # back plate
    box((0.5, 0.2, 0.3), loc=(0, -0.38, 1.3), material=plate)   # chest strap
    ball(0.24, loc=(0, -0.3, 1.75), material=body)
    eye = mat("beye", (1, 0.35, 0.4), emission=(1.0, 0.3, 0.35), strength=20)
    ball(0.045, loc=(-0.08, -0.52, 1.78), material=eye)
    ball(0.045, loc=(0.08, -0.52, 1.78), material=eye)
    # shoulder pauldrons and huge arms
    ball(0.3, loc=(-0.65, 0, 1.5), material=plate)
    ball(0.3, loc=(0.65, 0, 1.5), material=plate)
    cyl(0.16, 0.9, loc=(-0.72, -0.2, 0.95), rot=(math.radians(-15), 0, 0), material=body)
    cyl(0.16, 0.9, loc=(0.72, -0.2, 0.95), rot=(math.radians(-15), 0, 0), material=body)
    ball(0.22, loc=(-0.72, -0.35, 0.5), material=plate)
    ball(0.22, loc=(0.72, -0.35, 0.5), material=plate)


def walker():
    # The mech: a domed turret on a stout hull with four legs, frozen mid-step.
    hull = mat("hull", OLIVE, metallic=0.35, roughness=0.5)
    dark = mat("hull_d", OLIVE_D, metallic=0.4, roughness=0.45)
    box((2.6, 2.2, 0.9), loc=(0, 0, 1.55), material=hull, bevel=0.05)
    ball(1.05, loc=(0, 0, 2.15), material=hull, scale=(1, 1, 0.7))
    cyl(0.22, 2.4, loc=(0, -1.4, 2.25), rot=(math.radians(90), 0, 0), material=dark)   # barrel, down the lane
    cyl(0.34, 0.5, loc=(0, -0.55, 2.25), rot=(math.radians(90), 0, 0), material=dark)
    vent = mat("vent", (0.9, 0.4, 0.15), emission=(1.0, 0.45, 0.15), strength=6)
    for x in (-0.7, 0.7):
        box((0.5, 0.12, 0.3), loc=(x, 1.12, 1.7), material=vent)
    for sx in (-1, 1):
        for sy, lift in ((-0.8, 0.0), (0.8, 0.25)):
            cyl(0.18, 1.6, loc=(sx * 1.6, sy, 1.0 + lift), rot=(0, math.radians(sx * 28), 0), material=dark)
            cyl(0.16, 1.1, loc=(sx * 2.05, sy, 0.45 + lift), material=dark)
            ball(0.24, loc=(sx * 2.05, sy, 0.1 + lift), material=hull)
    # The ice: a beveled block with glass-like transmission around the mech.
    ice = mat("ice", (0.80, 0.95, 1.0), metallic=0.0, roughness=0.04, transmission=0.96, ior=1.25)
    box((4.8, 3.4, 3.5), loc=(0, 0, 1.75), material=ice, bevel=0.22)
    frost = mat("frost", (0.86, 0.97, 1.0), roughness=0.9, alpha=0.35)
    box((4.82, 3.42, 0.4), loc=(0, 0, 3.35), material=frost, bevel=0.1)


def sentinel():
    """A walker of the squad's own: the same hull family as the frozen one,
    smaller, unfrozen, facing up the lane with a stubby mortar."""
    hull = mat("shull", (0.16, 0.30, 0.56), metallic=0.35, roughness=0.5)
    dark = mat("shull_d", (0.09, 0.16, 0.32), metallic=0.4, roughness=0.45)
    trim = mat("strim", AMBER, metallic=0.2, roughness=0.5)
    box((1.7, 1.4, 0.6), loc=(0, 0, 1.0), material=hull, bevel=0.04)
    ball(0.7, loc=(0, 0, 1.4), material=hull, scale=(1, 1, 0.7))
    cyl(0.2, 1.2, loc=(0, 0.5, 1.85), rot=(math.radians(-55), 0, 0), material=dark)   # mortar, up the lane
    cyl(0.3, 0.35, loc=(0, 0.1, 1.55), rot=(math.radians(-55), 0, 0), material=dark)
    box((0.9, 0.12, 0.2), loc=(0, -0.72, 1.1), material=trim)   # stripe on the back
    ball(0.1, loc=(-0.5, -0.72, 1.3), material=mat("slamp", (1, 0.7, 0.3), emission=(1.0, 0.62, 0.2), strength=14))
    ball(0.1, loc=(0.5, -0.72, 1.3), material=mat("slamp", (1, 0.7, 0.3), emission=(1.0, 0.62, 0.2), strength=14))
    for sx in (-1, 1):
        for sy, lift in ((-0.55, 0.0), (0.55, 0.15)):
            cyl(0.12, 1.0, loc=(sx * 1.05, sy, 0.7 + lift), rot=(0, math.radians(sx * 30), 0), material=dark)
            cyl(0.1, 0.7, loc=(sx * 1.35, sy, 0.3 + lift), material=dark)
            ball(0.16, loc=(sx * 1.35, sy, 0.08 + lift), material=hull)


def frostlamp():
    """A big hurricane lantern on an iron pedestal: a wide frosted globe in a
    barred cage, a domed cap with a ring handle, and a cold flame inside."""
    iron = mat("firon", (0.22, 0.25, 0.32), metallic=0.75, roughness=0.45)
    iron_d = mat("firon_d", (0.12, 0.14, 0.19), metallic=0.7, roughness=0.5)
    # pedestal: a stepped plinth
    cyl(0.95, 0.22, loc=(0, 0, 0.11), verts=8, material=iron_d, bevel=0.02)
    cyl(0.72, 0.28, loc=(0, 0, 0.36), verts=8, material=iron, bevel=0.02)
    cyl(0.30, 0.9, loc=(0, 0, 0.95), verts=8, material=iron)
    # lantern base plate and oil well
    cyl(0.78, 0.16, loc=(0, 0, 1.48), verts=8, material=iron, bevel=0.02)
    cyl(0.55, 0.22, loc=(0, 0, 1.66), verts=8, material=iron_d, bevel=0.02)
    # frosted globe
    glass = mat("fglass", (0.80, 0.95, 1.0), roughness=0.35, transmission=0.85, ior=1.3, alpha=0.9)
    cyl(0.62, 1.3, loc=(0, 0, 2.42), verts=32, material=glass, bevel=0.0)
    # cage bars around the globe, and top and bottom rings
    for i in range(6):
        a = i * math.tau / 6
        cyl(0.035, 1.34, loc=(math.cos(a) * 0.64, math.sin(a) * 0.64, 2.42), material=iron_d, bevel=0)
    cyl(0.68, 0.08, loc=(0, 0, 1.80), verts=24, material=iron, bevel=0.0)
    cyl(0.68, 0.08, loc=(0, 0, 3.06), verts=24, material=iron, bevel=0.0)
    # domed cap, chimney and ring handle
    ball(0.72, loc=(0, 0, 3.08), material=iron, scale=(1, 1, 0.55))
    cyl(0.16, 0.3, loc=(0, 0, 3.55), material=iron_d)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.3, minor_radius=0.04, location=(0, 0, 3.95),
                                     rotation=(math.radians(90), 0, 0), major_segments=32, minor_segments=8)
    finish(bpy.context.object, iron, 0, smooth=True)
    # the cold flame: a bright core and a soft halo sphere
    core = mat("fcore", (0.85, 0.98, 1.0), emission=(0.75, 0.95, 1.0), strength=60)
    halo = mat("fhalo", (0.55, 0.9, 1.0), emission=(0.45, 0.85, 1.0), strength=8, alpha=0.35)
    ball(0.16, loc=(0, 0, 2.3), material=core, scale=(1, 1, 1.6))
    ball(0.42, loc=(0, 0, 2.42), material=halo)


def lamp():
    """A bridge lamp post, drawn along the rails."""
    post = mat("post", (0.32, 0.35, 0.42), metallic=0.6, roughness=0.5)
    cyl(0.06, 2.6, loc=(0, 0, 1.3), material=post)
    cyl(0.04, 0.6, loc=(0, 0.28, 2.55), rot=(math.radians(90), 0, 0), material=post)
    ball(0.16, loc=(0, 0.55, 2.5), material=mat("bulb", (1, 0.75, 0.4), emission=(1.0, 0.62, 0.22), strength=30))


PARTS = {
    # name: (builder, resolution, ortho span, note)
    "soldier_0": (lambda: soldier(0), 128, 2.1, "faces up the lane; walk frame A"),
    "soldier_1": (lambda: soldier(1), 128, 2.1, "faces up the lane; walk frame B"),
    "muzzle":    (muzzle, 64, 1.4, "additive flash, drawn at the rifle tip"),
    "husk_0":    (lambda: husk(0), 128, 2.1, "faces down the lane; walk frame A"),
    "husk_1":    (lambda: husk(1), 128, 2.1, "faces down the lane; walk frame B"),
    "runner_0":  (lambda: runner(0), 128, 2.1, "faces down the lane; sprint frame A"),
    "runner_1":  (lambda: runner(1), 128, 2.1, "faces down the lane; sprint frame B"),
    "brute_0":   (lambda: brute(0), 192, 3.1, "faces down the lane; walk frame A"),
    "brute_1":   (lambda: brute(1), 192, 3.1, "faces down the lane; walk frame B"),
    "walker":    (walker, 512, 6.4, "the frozen walker; ground point at centre"),
    "lamp":      (lamp, 96, 3.2, "rail lamp post"),
    "sentinel":  (sentinel, 192, 4.2, "ally walker; faces up the lane; ground point at centre"),
    "frostlamp": (frostlamp, 160, 6.4, "ally lantern; ground point at centre"),
}


def main():
    for name, (fn, res, ortho, note) in PARTS.items():
        build(name, res, ortho, fn, note)
    with open(os.path.join(OUT, "manifest.json"), "w") as f:
        json.dump(MANIFEST, f, indent=2, sort_keys=True)
    print("manifest written with", len(MANIFEST["parts"]), "parts")


main()
