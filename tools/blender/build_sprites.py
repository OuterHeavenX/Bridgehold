"""Render the Bridgehold sprite set from procedural Blender geometry.

Everything the bridge draws is modelled here from primitives, lit once for a
daylight scene (hard warm sun, soft sky fill), and rendered with a tilted
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
    scene.view_settings.exposure = 0.0

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

    world = scene.world or bpy.data.worlds.new("day")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (0.62, 0.78, 0.96, 1.0)
    bg.inputs[1].default_value = 0.9

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
            data.angle = math.radians(1.5)
        o = bpy.data.objects.new(name, data)
        o.location = loc
        o.rotation_euler = rot if rot else _aim(loc)
        bpy.context.collection.objects.link(o)
        return o

    # Daylight: a hard warm sun from high front-right, a soft sky fill from
    # the left, and a cool rim from behind so figures separate from the deck.
    light("SUN", "sun", (7, -5, 14), 4.2, (1.0, 0.96, 0.88))
    light("AREA", "skyfill", (-6, -4, 6), 350, (0.72, 0.84, 1.0), size=6)
    light("AREA", "rim", (3, 7, 6), 220, (0.85, 0.95, 1.0), size=4)

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


def legs(y_off, stride, r=0.09, h=0.6, color=NAVY_D, spread=0.14, z=0.3, boots=None):
    """Two legs, one swung forward by `stride` along Y, with optional boots."""
    m = mat("legs", color, roughness=0.7)
    for sx, sy in ((-spread, y_off + stride), (spread, y_off - stride)):
        cyl(r, h, loc=(sx, sy, z), material=m)
        if boots:
            box((r * 2.3, r * 3.2, r * 1.6), loc=(sx, sy + r * 0.6, r * 0.8), material=boots, bevel=0.01)


def soldier(frame):
    stride = 0.12 if frame == 0 else -0.12
    boots = mat("boots", (0.10, 0.09, 0.10), roughness=0.5)
    legs(0, stride, boots=boots)
    # knee pads
    pad = mat("pad", NAVY_D, roughness=0.5)
    ball(0.1, loc=(-0.14, stride + 0.09, 0.42), material=pad)
    ball(0.1, loc=(0.14, -stride + 0.09, 0.42), material=pad)
    torso = mat("coat", NAVY, roughness=0.6)
    box((0.5, 0.32, 0.62), loc=(0, 0, 0.91), material=torso)
    vest = mat("vest", AMBER, roughness=0.5)
    box((0.42, 0.14, 0.42), loc=(0, -0.12, 0.92), material=vest)   # back plate (faces camera)
    box((0.42, 0.14, 0.42), loc=(0, 0.12, 0.92), material=vest)
    # hazard stripe across the back plate, shoulder straps, pouches
    stripe = mat("stripe", (0.12, 0.12, 0.14), roughness=0.6)
    box((0.42, 0.02, 0.06), loc=(0, -0.2, 0.92), material=stripe, bevel=0)
    for sx in (-0.15, 0.15):
        box((0.08, 0.36, 0.05), loc=(sx, 0, 1.24), material=stripe, bevel=0)
        box((0.12, 0.1, 0.14), loc=(sx, -0.24, 0.72), material=pad)   # belt pouches
    # backpack with a bedroll and a radio antenna
    box((0.3, 0.16, 0.34), loc=(0, -0.26, 0.98), material=mat("pack", NAVY_D, roughness=0.8))
    cyl(0.07, 0.34, loc=(0, -0.3, 1.2), rot=(0, math.radians(90), 0), material=mat("roll", (0.35, 0.32, 0.26), roughness=0.9))
    cyl(0.012, 0.5, loc=(-0.12, -0.32, 1.35), material=stripe, bevel=0)
    ball(0.07, loc=(0.2, -0.3, 0.8), material=mat("lantern", (1, 0.7, 0.3), emission=(1.0, 0.62, 0.2), strength=14))
    # head, helmet with a brim and a visor stripe, collar
    ball(0.17, loc=(0, 0, 1.4), material=mat("skin", SKIN, roughness=0.6))
    cyl(0.2, 0.08, loc=(0, 0, 1.3), material=torso)   # collar
    ball(0.21, loc=(0, 0, 1.47), material=mat("helmet", NAVY_D, roughness=0.45), scale=(1, 1, 0.75))
    cyl(0.235, 0.03, loc=(0, 0, 1.4), material=mat("brim", NAVY_D, roughness=0.45), bevel=0)
    box((0.3, 0.06, 0.05), loc=(0, 0.2, 1.44), material=mat("visor", (0.6, 0.9, 1.0), emission=(0.5, 0.85, 1.0), strength=4), bevel=0)
    # arms forward holding the rifle, with gloves
    arm = mat("arm", NAVY, roughness=0.6)
    glove = mat("glove", (0.18, 0.15, 0.12), roughness=0.7)
    cyl(0.07, 0.5, loc=(-0.3, 0.2, 1.0), rot=(math.radians(90), 0, 0), material=arm)
    cyl(0.07, 0.5, loc=(0.3, 0.2, 1.0), rot=(math.radians(90), 0, 0), material=arm)
    ball(0.08, loc=(-0.28, 0.45, 1.0), material=glove)
    ball(0.08, loc=(0.24, 0.42, 1.03), material=glove)
    # rifle: barrel, receiver, magazine, stock, sight
    g = mat("gun", GUN, metallic=0.6, roughness=0.35)
    cyl(0.045, 1.0, loc=(0.18, 0.55, 1.05), rot=(math.radians(90), 0, 0), material=g)
    box((0.1, 0.34, 0.16), loc=(0.18, 0.2, 1.0), material=g)
    box((0.06, 0.1, 0.22), loc=(0.18, 0.28, 0.88), material=g)     # magazine
    box((0.08, 0.26, 0.1), loc=(0.18, -0.06, 0.98), material=mat("stock", (0.3, 0.2, 0.12), roughness=0.7))
    box((0.03, 0.08, 0.06), loc=(0.18, 0.5, 1.12), material=g, bevel=0)   # sight


def muzzle():
    """A flash the runtime blends over the rifle tip on firing frames."""
    f = mat("flash", (1, 0.85, 0.5), emission=(1.0, 0.75, 0.3), strength=40)
    cone(0.0, 0.22, 0.5, loc=(0, 0.2, 0.6), rot=(math.radians(-90), 0, 0), material=f)
    ball(0.16, loc=(0, 0, 0.6), material=f)


def husk(frame):
    stride = 0.14 if frame == 0 else -0.14
    legs(0, stride, r=0.08, h=0.5, color=HUSK_D, spread=0.13, z=0.25)
    body = mat("husk", HUSK, roughness=0.8)
    rags = mat("rags", HUSK_D, roughness=0.95)
    bone = mat("bone", (0.82, 0.84, 0.72), roughness=0.7)
    # hunched, leaning toward the camera (down the lane)
    ball(0.34, loc=(0, -0.05, 0.82), material=body, scale=(1, 0.8, 1.05))
    # torn coat panels hanging off the shoulders and hips
    box((0.5, 0.2, 0.36), loc=(0, 0.02, 0.62), material=rags)
    box((0.16, 0.18, 0.4), loc=(-0.28, 0.06, 0.5), material=rags, bevel=0)
    box((0.12, 0.18, 0.3), loc=(0.3, 0.02, 0.44), material=rags, bevel=0)
    # exposed ribs on the chest
    for i in range(3):
        cyl(0.015, 0.4, loc=(0, -0.36, 0.72 + i * 0.09), rot=(0, math.radians(90), 0), material=bone, bevel=0)
    # head, jaw hanging open, teeth, glowing eyes
    ball(0.2, loc=(0, -0.22, 1.18), material=body)
    box((0.22, 0.16, 0.08), loc=(0, -0.34, 1.02), material=body, bevel=0.01)
    for sx in (-0.06, 0.0, 0.06):
        box((0.03, 0.03, 0.05), loc=(sx, -0.4, 1.08), material=bone, bevel=0)
    eye = mat("eye", (1, 0.2, 0.25), emission=(1.0, 0.18, 0.25), strength=18)
    ball(0.035, loc=(-0.07, -0.4, 1.2), material=eye)
    ball(0.035, loc=(0.07, -0.4, 1.2), material=eye)
    # arms reaching forward, one longer, with claw fingers
    arm = mat("husk_arm", HUSK, roughness=0.8)
    cyl(0.06, 0.6, loc=(-0.28, -0.34, 0.95), rot=(math.radians(-80), 0, 0), material=arm)
    cyl(0.06, 0.5, loc=(0.28, -0.3, 0.9), rot=(math.radians(-80), 0, 0), material=arm)
    for sx, sy, sz in ((-0.28, -0.64, 1.0), (0.28, -0.55, 0.94)):
        for k in (-0.04, 0.0, 0.04):
            cyl(0.012, 0.1, loc=(sx + k, sy - 0.05, sz), rot=(math.radians(-80), 0, 0), material=bone, bevel=0)


def runner(frame):
    stride = 0.26 if frame == 0 else -0.26
    legs(0, stride, r=0.06, h=0.7, color=(0.45, 0.36, 0.26), spread=0.1, z=0.35)
    body = mat("runner", RUNNER, roughness=0.75)
    bone = mat("rbone", (0.82, 0.84, 0.72), roughness=0.7)
    # gaunt, leaning hard forward; spine ridge along the back
    ball(0.22, loc=(0, -0.12, 0.95), material=body, scale=(0.9, 1.4, 1.0))
    for i in range(4):
        ball(0.035, loc=(0, 0.1 - i * 0.1, 1.05 + i * 0.03), material=bone)
    ball(0.15, loc=(0, -0.42, 1.12), material=body)
    # hair tufts and a snarl
    hair = mat("hair", (0.16, 0.12, 0.1), roughness=0.9)
    for k in (-0.08, 0.0, 0.08):
        cone(0.04, 0.0, 0.16, loc=(k, -0.36, 1.28), rot=(math.radians(-20), 0, 0), material=hair)
    box((0.14, 0.1, 0.05), loc=(0, -0.54, 1.04), material=bone, bevel=0)
    eye = mat("reye", (1, 0.2, 0.25), emission=(1.0, 0.18, 0.25), strength=18)
    ball(0.03, loc=(-0.05, -0.56, 1.14), material=eye)
    ball(0.03, loc=(0.05, -0.56, 1.14), material=eye)
    # arms swinging opposite the legs, with long claws
    arm = mat("rarm", RUNNER, roughness=0.75)
    for sx, sw in ((-0.2, -stride * 0.6), (0.2, stride * 0.6)):
        cyl(0.045, 0.5, loc=(sx, -0.1 + sw, 0.95), rot=(math.radians(-60), 0, 0), material=arm)
        for k in (-0.03, 0.0, 0.03):
            cyl(0.01, 0.14, loc=(sx + k, -0.35 + sw, 0.75), rot=(math.radians(-60), 0, 0), material=bone, bevel=0)


def brute(frame):
    stride = 0.1 if frame == 0 else -0.1
    legs(0, stride, r=0.16, h=0.7, color=BRUTE_D, spread=0.3, z=0.35)
    body = mat("brute", BRUTE, roughness=0.7)
    plate = mat("plate", BRUTE_D, metallic=0.3, roughness=0.5)
    rivet = mat("rivet", (0.55, 0.5, 0.62), metallic=0.8, roughness=0.35)
    crack = mat("crack", (1, 0.4, 0.6), emission=(1.0, 0.3, 0.55), strength=10)
    box((1.1, 0.7, 0.9), loc=(0, 0, 1.15), material=body)
    box((1.2, 0.2, 0.6), loc=(0, 0.36, 1.25), material=plate)   # back plate
    for sx in (-0.45, -0.15, 0.15, 0.45):
        ball(0.04, loc=(sx, 0.47, 1.5), material=rivet)
        ball(0.04, loc=(sx, 0.47, 1.0), material=rivet)
    box((0.5, 0.2, 0.3), loc=(0, -0.38, 1.3), material=plate)   # chest strap
    box((0.06, 0.04, 0.5), loc=(0.2, -0.37, 1.1), material=crack, bevel=0)   # a glowing crack down the chest
    # chain across the shoulder
    for i in range(7):
        ball(0.045, loc=(-0.6 + i * 0.2, -0.3 + abs(i - 3) * 0.02, 1.62 - abs(i - 3) * 0.05), material=rivet)
    ball(0.24, loc=(0, -0.3, 1.75), material=body)
    # crest of horns on the skull
    for k in (-0.1, 0.0, 0.1):
        cone(0.05, 0.0, 0.22, loc=(k, -0.24, 2.02), rot=(math.radians(-15), 0, 0), material=plate)
    eye = mat("beye", (1, 0.35, 0.4), emission=(1.0, 0.3, 0.35), strength=20)
    ball(0.045, loc=(-0.08, -0.52, 1.78), material=eye)
    ball(0.045, loc=(0.08, -0.52, 1.78), material=eye)
    # shoulder pauldrons with spikes, and huge arms with knuckle plates
    for sx in (-1, 1):
        ball(0.3, loc=(sx * 0.65, 0, 1.5), material=plate)
        cone(0.06, 0.0, 0.25, loc=(sx * 0.75, 0, 1.78), material=plate)
        cyl(0.16, 0.9, loc=(sx * 0.72, -0.2, 0.95), rot=(math.radians(-15), 0, 0), material=body)
        ball(0.22, loc=(sx * 0.72, -0.35, 0.5), material=plate)
        for k in (-0.08, 0.0, 0.08):
            ball(0.05, loc=(sx * 0.72 + k, -0.55, 0.5), material=rivet)


def walker():
    # The mech: a domed turret on a stout hull with four legs, frozen mid-step.
    hull = mat("hull", OLIVE, metallic=0.35, roughness=0.5)
    dark = mat("hull_d", OLIVE_D, metallic=0.4, roughness=0.45)
    rivet = mat("wrivet", (0.55, 0.6, 0.5), metallic=0.8, roughness=0.35)
    box((2.6, 2.2, 0.9), loc=(0, 0, 1.55), material=hull, bevel=0.05)
    for sx in (-1.1, -0.55, 0.0, 0.55, 1.1):
        ball(0.05, loc=(sx, -1.12, 1.85), material=rivet)
        ball(0.05, loc=(sx, -1.12, 1.25), material=rivet)
    box((2.0, 0.3, 0.25), loc=(0, -1.0, 1.55), material=dark, bevel=0.03)   # front plate
    ball(1.05, loc=(0, 0, 2.15), material=hull, scale=(1, 1, 0.7))
    cyl(0.5, 0.2, loc=(0, 0, 2.85), material=dark)                            # hatch ring
    cyl(0.03, 1.2, loc=(0.6, 0.3, 3.4), material=dark, bevel=0)               # antenna
    ball(0.06, loc=(0.6, 0.3, 4.0), material=mat("beacon", (1, 0.3, 0.2), emission=(1.0, 0.25, 0.15), strength=20))
    cyl(0.22, 2.4, loc=(0, -1.4, 2.25), rot=(math.radians(90), 0, 0), material=dark)   # barrel, down the lane
    cyl(0.34, 0.5, loc=(0, -0.55, 2.25), rot=(math.radians(90), 0, 0), material=dark)
    cyl(0.28, 0.12, loc=(0, -2.6, 2.25), rot=(math.radians(90), 0, 0), material=dark)  # muzzle brake
    lens = mat("lens", (1, 0.5, 0.2), emission=(1.0, 0.45, 0.15), strength=12)
    for sx in (-0.45, 0.45):
        ball(0.12, loc=(sx, -0.95, 2.4), material=lens)
    vent = mat("vent", (0.9, 0.4, 0.15), emission=(1.0, 0.45, 0.15), strength=6)
    for x in (-0.7, 0.7):
        box((0.5, 0.12, 0.3), loc=(x, 1.12, 1.7), material=vent)
    for sx in (-1, 1):
        for sy, lift in ((-0.8, 0.0), (0.8, 0.25)):
            cyl(0.18, 1.6, loc=(sx * 1.6, sy, 1.0 + lift), rot=(0, math.radians(sx * 28), 0), material=dark)
            ball(0.22, loc=(sx * 1.2, sy, 1.6 + lift), material=hull)                # hip joint
            cyl(0.16, 1.1, loc=(sx * 2.05, sy, 0.45 + lift), material=dark)
            ball(0.24, loc=(sx * 2.05, sy, 0.1 + lift), material=hull)
    # The ice: a beveled block with glass-like transmission around the mech,
    # a frost cap, and a few inner planes so the light breaks up inside.
    ice = mat("ice", (0.30, 0.62, 0.92), metallic=0.0, roughness=0.28, transmission=0.5, ior=1.31)
    box((4.8, 3.4, 3.5), loc=(0, 0, 1.75), material=ice, bevel=0.22)
    frost = mat("frost", (0.45, 0.72, 0.92), roughness=0.85, alpha=0.6)
    box((4.82, 3.42, 0.4), loc=(0, 0, 3.35), material=frost, bevel=0.1)
    # a dark iron cradle under the block so it sits on the road rather than floats
    cradle = mat("cradle", (0.16, 0.17, 0.2), metallic=0.7, roughness=0.5)
    box((5.2, 3.8, 0.35), loc=(0, 0, 0.17), material=cradle, bevel=0.05)
    for sx in (-1, 1):
        for sy in (-1, 1):
            box((0.35, 0.35, 3.7), loc=(sx * 2.45, sy * 1.75, 1.85), material=cradle, bevel=0.04)
    facet = mat("facet", (0.9, 0.98, 1.0), roughness=0.3, alpha=0.18)
    box((0.02, 2.4, 2.6), loc=(-1.4, 0.2, 1.8), rot=(0, math.radians(12), math.radians(20)), material=facet, bevel=0)
    box((0.02, 2.0, 2.2), loc=(1.5, -0.3, 1.6), rot=(0, math.radians(-15), math.radians(-30)), material=facet, bevel=0)


def colossus(frame):
    """The giant in the bay: a chained stone titan. Faces up the lane once
    unchained; walk frames swing the arms and legs."""
    stride = 0.5 if frame == 0 else -0.5
    stone = mat("stone", (0.42, 0.44, 0.50), roughness=0.85)
    dark = mat("stone_d", (0.26, 0.27, 0.33), roughness=0.9)
    moss = mat("moss", (0.30, 0.42, 0.30), roughness=0.95)
    glow = mat("cglow", (0.5, 0.9, 1.0), emission=(0.45, 0.85, 1.0), strength=16)
    iron = mat("cchain", (0.28, 0.3, 0.36), metallic=0.8, roughness=0.4)
    # legs and feet
    for sx, sy in ((-0.7, stride), (0.7, -stride)):
        cyl(0.42, 2.2, loc=(sx, sy, 1.1), verts=10, material=stone, bevel=0.02)
        box((0.95, 1.3, 0.5), loc=(sx, sy + 0.25, 0.25), material=dark, bevel=0.04)
        ball(0.5, loc=(sx, sy, 2.2), material=stone)
    # torso, pelvis, chest plates
    box((2.6, 1.6, 2.6), loc=(0, 0, 3.6), material=stone, bevel=0.08)
    box((2.0, 1.4, 0.9), loc=(0, 0, 2.4), material=dark, bevel=0.05)
    box((2.8, 0.4, 1.4), loc=(0, 0.8, 4.0), material=dark, bevel=0.05)   # back slab (faces camera)
    for sx in (-0.8, 0.0, 0.8):
        box((0.5, 0.2, 1.2), loc=(sx, 0.95, 4.0), material=moss, bevel=0.02)
    # core seam glowing through the chest and back
    box((0.12, 1.9, 1.6), loc=(0, 0, 3.6), material=glow, bevel=0)
    # shoulders and arms, swinging opposite the legs
    for sx, sw in ((-1, -stride * 0.7), (1, stride * 0.7)):
        ball(0.75, loc=(sx * 1.7, 0, 4.7), material=stone)
        cyl(0.42, 2.4, loc=(sx * 1.9, sw, 3.2), verts=10, rot=(math.radians(sw * 30), 0, 0), material=stone, bevel=0.02)
        ball(0.6, loc=(sx * 1.95, sw * 1.6, 1.9), material=dark)
    # head: a helm-like block with glowing eye slit
    box((1.2, 1.1, 1.1), loc=(0, 0, 5.6), material=stone, bevel=0.06)
    box((0.9, 0.2, 0.12), loc=(0, 0.6, 5.7), material=glow, bevel=0)
    cone(0.3, 0.0, 0.6, loc=(0, 0, 6.4), material=dark)
    # broken chain links still hanging from the wrists
    for sx in (-1, 1):
        for i in range(4):
            ball(0.12, loc=(sx * 2.2, (stride * 0.7 * sx if False else 0) + 0.1 * i, 1.5 - i * 0.28), material=iron)


def wheel():
    """The bay's valve wheel: a spoked iron wheel on a stem, seen from above."""
    iron = mat("wiron", (0.55, 0.16, 0.14), metallic=0.6, roughness=0.45)
    dark = mat("wiron_d", (0.2, 0.2, 0.24), metallic=0.7, roughness=0.4)
    cyl(0.5, 0.25, loc=(0, 0, 0.12), verts=8, material=dark)
    cyl(0.18, 0.9, loc=(0, 0, 0.6), material=dark)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.95, minor_radius=0.1, location=(0, 0, 1.05), major_segments=40, minor_segments=10)
    finish(bpy.context.object, iron, 0, smooth=True)
    for i in range(6):
        a = i * math.tau / 6
        cyl(0.06, 1.8, loc=(0, 0, 1.05), rot=(math.radians(90), 0, a), material=iron, bevel=0)
    ball(0.22, loc=(0, 0, 1.05), material=dark)


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


BONE = (0.90, 0.88, 0.78)
BONE_D = (0.55, 0.52, 0.42)
RUST = (0.42, 0.22, 0.14)
GOLD = (0.85, 0.62, 0.20)
CRIMSON = (0.55, 0.08, 0.10)


def skull(frame):
    """A rolling skull: the crypt's runner. It tumbles, so the frames turn it."""
    bone = mat("skull", BONE, roughness=0.6)
    dark = mat("skull_d", (0.12, 0.10, 0.10), roughness=0.9)
    rot = 0.0 if frame == 0 else math.radians(35)
    ball(0.42, loc=(0, 0, 0.44), material=bone, scale=(1, 1.05, 1.1))
    box((0.5, 0.36, 0.26), loc=(0, -0.16, 0.2), rot=(rot, 0, 0), material=bone, bevel=0.03)   # jaw
    for sx in (-0.15, 0.15):
        ball(0.11, loc=(sx, -0.36, 0.5), material=dark)
        ball(0.05, loc=(sx, -0.44, 0.5), material=mat("seye", (0.4, 1.0, 0.5), emission=(0.35, 1.0, 0.45), strength=16))
    for sx in (-0.12, -0.04, 0.04, 0.12):
        box((0.05, 0.04, 0.09), loc=(sx, -0.38, 0.3), material=bone, bevel=0)
    cone(0.05, 0.0, 0.1, loc=(0, -0.42, 0.42), rot=(math.radians(-90), 0, 0), material=bone)   # nose ridge


def bonewalker(frame):
    """A skeleton warrior with a rusted blade and a round shield: the crypt's husk."""
    stride = 0.14 if frame == 0 else -0.14
    bone = mat("bone", BONE, roughness=0.6)
    dark = mat("bone_d", BONE_D, roughness=0.7)
    rust = mat("rust", RUST, metallic=0.5, roughness=0.6)
    for sx, sy in ((-0.13, stride), (0.13, -stride)):
        cyl(0.05, 0.55, loc=(sx, sy, 0.28), material=bone, bevel=0)
        ball(0.06, loc=(sx, sy, 0.55), material=dark)
    # pelvis, spine, ribs
    box((0.3, 0.18, 0.12), loc=(0, 0, 0.6), material=dark, bevel=0.02)
    cyl(0.04, 0.55, loc=(0, 0.02, 0.9), material=bone, bevel=0)
    for i in range(4):
        bpy.ops.mesh.primitive_torus_add(major_radius=0.17 - i * 0.02, minor_radius=0.025, location=(0, 0.02, 0.78 + i * 0.09), major_segments=20, minor_segments=6)
        finish(bpy.context.object, bone, 0, smooth=True)
    # shoulders, arms: shield arm forward-left, sword arm raised right
    for sx in (-1, 1):
        ball(0.07, loc=(sx * 0.2, 0.02, 1.16), material=dark)
    cyl(0.04, 0.45, loc=(-0.25, -0.2, 1.0), rot=(math.radians(-70), 0, 0), material=bone, bevel=0)
    cyl(0.04, 0.45, loc=(0.28, -0.1, 1.2), rot=(math.radians(-40), 0, 0), material=bone, bevel=0)
    # round shield with a boss, a chipped sword
    cyl(0.22, 0.05, loc=(-0.3, -0.42, 0.95), rot=(math.radians(90), 0, 0), material=rust)
    ball(0.06, loc=(-0.3, -0.46, 0.95), material=mat("boss", GOLD, metallic=0.7, roughness=0.4))
    box((0.05, 0.7, 0.12), loc=(0.34, -0.45, 1.4), rot=(math.radians(-30), 0, 0), material=mat("blade", (0.55, 0.58, 0.6), metallic=0.8, roughness=0.35), bevel=0)
    box((0.06, 0.16, 0.06), loc=(0.32, -0.16, 1.28), material=rust, bevel=0)
    # skull with a dented helm and green eyes
    ball(0.17, loc=(0, 0, 1.36), material=bone)
    ball(0.19, loc=(0, 0.02, 1.42), material=rust, scale=(1, 1, 0.6))
    for sx in (-0.06, 0.06):
        ball(0.03, loc=(sx, -0.15, 1.36), material=mat("beye", (0.4, 1.0, 0.5), emission=(0.35, 1.0, 0.45), strength=16))


def bonelord(frame):
    """An armoured skeletal knight with a great mace: the crypt's brute."""
    stride = 0.1 if frame == 0 else -0.1
    bone = mat("lbone", BONE, roughness=0.6)
    plate = mat("lplate", (0.30, 0.30, 0.34), metallic=0.75, roughness=0.4)
    gold = mat("lgold", GOLD, metallic=0.8, roughness=0.35)
    cloth = mat("lcloth", CRIMSON, roughness=0.9)
    for sx, sy in ((-0.3, stride), (0.3, -stride)):
        cyl(0.14, 0.7, loc=(sx, sy, 0.35), material=plate)
        box((0.36, 0.5, 0.2), loc=(sx, sy + 0.1, 0.1), material=plate, bevel=0.02)
    # tabard and cuirass
    box((1.0, 0.6, 0.9), loc=(0, 0, 1.15), material=plate, bevel=0.04)
    box((0.5, 0.05, 1.1), loc=(0, -0.33, 0.9), material=cloth, bevel=0)
    box((0.6, 0.05, 0.2), loc=(0, -0.34, 1.45), material=gold, bevel=0)
    # pauldrons with spikes, chains
    for sx in (-1, 1):
        ball(0.3, loc=(sx * 0.62, 0, 1.55), material=plate)
        cone(0.08, 0.0, 0.3, loc=(sx * 0.75, 0, 1.85), material=gold)
        cyl(0.13, 0.9, loc=(sx * 0.7, -0.2, 0.95), rot=(math.radians(-15), 0, 0), material=plate)
    # the great mace, held out to the right
    cyl(0.05, 1.3, loc=(0.85, -0.5, 1.1), rot=(math.radians(-60), 0, 0), material=plate, bevel=0)
    ball(0.26, loc=(0.85, -1.0, 1.65), material=plate)
    for i in range(6):
        a = i * math.tau / 6
        cone(0.06, 0.0, 0.2, loc=(0.85 + math.cos(a) * 0.3, -1.0, 1.65 + math.sin(a) * 0.3), rot=(0, a + math.radians(90), 0), material=gold)
    # horned helm over a skull
    ball(0.26, loc=(0, -0.2, 1.8), material=bone)
    ball(0.3, loc=(0, -0.18, 1.86), material=plate, scale=(1, 1, 0.7))
    for sx in (-1, 1):
        cone(0.07, 0.0, 0.45, loc=(sx * 0.32, -0.2, 2.05), rot=(0, sx * math.radians(35), 0), material=gold)
    for sx in (-0.09, 0.09):
        ball(0.045, loc=(sx, -0.44, 1.8), material=mat("leye", (1.0, 0.35, 0.2), emission=(1.0, 0.3, 0.15), strength=20))


def reliquary():
    """The crypt's walker: a great stone sarcophagus sliding down the lane with
    the lich standing on its lid. Same footprint as the frozen walker."""
    stone = mat("rstone", (0.42, 0.40, 0.44), roughness=0.8)
    dark = mat("rstone_d", (0.22, 0.20, 0.24), roughness=0.85)
    gold = mat("rgold", GOLD, metallic=0.8, roughness=0.35)
    bone = mat("rbone", BONE, roughness=0.6)
    cloth = mat("rcloth", CRIMSON, roughness=0.9)
    glow = mat("rglow", (0.4, 1.0, 0.5), emission=(0.35, 1.0, 0.45), strength=14)
    # the box, its lid, gold banding, a skull relief on the front
    box((4.6, 3.2, 2.4), loc=(0, 0, 1.2), material=stone, bevel=0.12)
    box((4.8, 3.4, 0.5), loc=(0, 0, 2.6), material=dark, bevel=0.08)
    for y in (-1.2, 0.0, 1.2):
        box((4.7, 0.18, 2.5), loc=(0, y, 1.2), material=gold, bevel=0.02)
    ball(0.7, loc=(0, -1.62, 1.4), material=bone, scale=(1, 0.3, 1.1))
    for sx in (-0.25, 0.25):
        ball(0.14, loc=(sx, -1.85, 1.5), material=glow)
    # green fire in braziers at the four corners
    for sx in (-1, 1):
        for sy in (-1, 1):
            cyl(0.3, 0.4, loc=(sx * 2.0, sy * 1.3, 3.0), verts=8, material=dark)
            ball(0.32, loc=(sx * 2.0, sy * 1.3, 3.45), material=glow, scale=(1, 1, 1.5))
    # the lich: robed, hooded, a staff with a skull, standing on the lid
    cone(0.7, 0.35, 1.9, loc=(0, 0.2, 3.8), material=cloth)
    ball(0.42, loc=(0, 0.2, 4.9), material=cloth)
    ball(0.28, loc=(0, -0.05, 4.85), material=bone)
    for sx in (-0.1, 0.1):
        ball(0.05, loc=(sx, -0.3, 4.9), material=glow)
    cyl(0.06, 3.0, loc=(0.7, -0.3, 4.3), material=dark, bevel=0)
    ball(0.28, loc=(0.7, -0.3, 5.9), material=bone)
    ball(0.36, loc=(0.7, -0.3, 6.1), material=glow, scale=(1, 1, 1.4))
    for sx in (-1, 1):
        ball(0.3, loc=(sx * 0.8, 0.2, 4.4), material=cloth)


def torch():
    """A wall torch: an iron bracket and a warm flame."""
    iron = mat("tiron", (0.2, 0.2, 0.24), metallic=0.7, roughness=0.5)
    cyl(0.06, 1.2, loc=(0, 0, 0.6), rot=(math.radians(-20), 0, 0), material=iron)
    cyl(0.14, 0.3, loc=(0, -0.25, 1.25), material=iron)
    ball(0.22, loc=(0, -0.25, 1.55), material=mat("flame", (1.0, 0.6, 0.15), emission=(1.0, 0.55, 0.12), strength=30), scale=(1, 1, 1.7))
    ball(0.12, loc=(0, -0.25, 1.85), material=mat("flame2", (1.0, 0.85, 0.4), emission=(1.0, 0.85, 0.4), strength=40), scale=(1, 1, 1.6))


def brazier():
    """A stone bowl on a plinth holding a green crystal."""
    stone = mat("bstone", (0.35, 0.34, 0.38), roughness=0.85)
    cyl(0.75, 0.3, loc=(0, 0, 0.15), verts=8, material=stone)
    cyl(0.5, 0.5, loc=(0, 0, 0.55), verts=8, material=stone)
    cyl(0.85, 0.35, loc=(0, 0, 0.95), verts=12, material=stone)
    crystal = mat("crystal", (0.4, 1.0, 0.55), emission=(0.3, 1.0, 0.45), strength=12, roughness=0.2)
    cone(0.42, 0.0, 1.5, loc=(0, 0, 1.8), verts=6, material=crystal)
    cone(0.22, 0.0, 0.8, loc=(0.45, 0.2, 1.4), rot=(0, math.radians(25), 0), verts=6, material=crystal)
    cone(0.18, 0.0, 0.7, loc=(-0.4, -0.2, 1.35), rot=(0, math.radians(-30), 0), verts=6, material=crystal)


def coffin():
    """A stone coffin with a skull relief, leaning against the wall."""
    stone = mat("cstone", (0.30, 0.30, 0.36), roughness=0.85)
    trim = mat("ctrim", (0.55, 0.52, 0.42), roughness=0.7)
    box((1.4, 0.6, 2.6), loc=(0, 0, 1.3), rot=(math.radians(-12), 0, 0), material=stone, bevel=0.06)
    box((1.1, 0.1, 2.2), loc=(0, -0.32, 1.35), rot=(math.radians(-12), 0, 0), material=trim, bevel=0.02)
    ball(0.3, loc=(0, -0.5, 1.9), material=mat("cskull", BONE, roughness=0.6), scale=(1, 0.5, 1.1))


def lamp():
    """A bridge lamp post, drawn along the rails."""
    post = mat("post", (0.32, 0.35, 0.42), metallic=0.6, roughness=0.5)
    cyl(0.06, 2.6, loc=(0, 0, 1.3), material=post)
    cyl(0.04, 0.6, loc=(0, 0.28, 2.55), rot=(math.radians(90), 0, 0), material=post)
    ball(0.16, loc=(0, 0.55, 2.5), material=mat("bulb", (1, 0.75, 0.4), emission=(1.0, 0.62, 0.22), strength=30))


PARTS = {
    # name: (builder, resolution, ortho span, note)
    "soldier_0": (lambda: soldier(0), 160, 2.1, "faces up the lane; walk frame A"),
    "soldier_1": (lambda: soldier(1), 160, 2.1, "faces up the lane; walk frame B"),
    "muzzle":    (muzzle, 64, 1.4, "additive flash, drawn at the rifle tip"),
    "husk_0":    (lambda: husk(0), 160, 2.1, "faces down the lane; walk frame A"),
    "husk_1":    (lambda: husk(1), 160, 2.1, "faces down the lane; walk frame B"),
    "runner_0":  (lambda: runner(0), 160, 2.1, "faces down the lane; sprint frame A"),
    "runner_1":  (lambda: runner(1), 160, 2.1, "faces down the lane; sprint frame B"),
    "brute_0":   (lambda: brute(0), 224, 3.1, "faces down the lane; walk frame A"),
    "brute_1":   (lambda: brute(1), 224, 3.1, "faces down the lane; walk frame B"),
    "walker":    (walker, 512, 6.4, "the frozen walker; ground point at centre"),
    "lamp":      (lamp, 96, 3.2, "rail lamp post"),
    "sentinel":  (sentinel, 192, 4.2, "ally walker; faces up the lane; ground point at centre"),
    "frostlamp": (frostlamp, 160, 6.4, "ally lantern; ground point at centre"),
    "colossus_0": (lambda: colossus(0), 320, 9.0, "the giant; faces up the lane; walk frame A"),
    "colossus_1": (lambda: colossus(1), 320, 9.0, "the giant; faces up the lane; walk frame B"),
    "wheel":     (wheel, 96, 2.6, "the bay's valve wheel, seen from above; rotate to spin"),
    # the crypt, levels 11 to 20
    "skull_0":      (lambda: skull(0), 128, 1.6, "faces down the lane; tumble frame A"),
    "skull_1":      (lambda: skull(1), 128, 1.6, "faces down the lane; tumble frame B"),
    "bonewalker_0": (lambda: bonewalker(0), 160, 2.1, "faces down the lane; walk frame A"),
    "bonewalker_1": (lambda: bonewalker(1), 160, 2.1, "faces down the lane; walk frame B"),
    "bonelord_0":   (lambda: bonelord(0), 224, 3.1, "faces down the lane; walk frame A"),
    "bonelord_1":   (lambda: bonelord(1), 224, 3.1, "faces down the lane; walk frame B"),
    "reliquary":    (reliquary, 512, 7.6, "the crypt's walker; ground point at centre"),
    "torch":        (torch, 96, 2.6, "wall torch, drawn on the crypt walls"),
    "brazier":      (brazier, 128, 3.6, "green crystal brazier, drawn along the crypt walls"),
    "coffin":       (coffin, 128, 3.4, "stone coffin, drawn against the crypt walls"),
}


def main():
    for name, (fn, res, ortho, note) in PARTS.items():
        build(name, res, ortho, fn, note)
    with open(os.path.join(OUT, "manifest.json"), "w") as f:
        json.dump(MANIFEST, f, indent=2, sort_keys=True)
    print("manifest written with", len(MANIFEST["parts"]), "parts")


main()
