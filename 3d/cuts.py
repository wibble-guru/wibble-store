"""
컷씬(1인칭 동작 컷) 가이드 렌더 (Blender 4.3+)

build_store.py 로 매장을 그대로 지은 뒤, 컷마다 카메라를 옮기고 그 컷에만 필요한 소품
(과자봉지, 휴대폰, 물기, 발자국, 손·아래팔 자리 등)을 임시로 놓고 렌더한다.
구도·원근·물건 위치는 이 렌더가 정하고, AI 이미지 생성은 재질과 분위기만 입힌다.

실행 (3d/ 에서):
  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup -P cuts.py -- [컷 id ...]
  python3 postprocess.py $(ls renders/cuts/*_color.png | sed 's|renders/||; s|_color.png||')

- 컷 id 를 주지 않으면 전부 렌더한다. 예: `-- q1-pickup q5d-door`
- 결과: renders/cuts/<id>.<n>_{color,depth_raw,normal}.png → postprocess 후 _guide/_depth/_lines 추가
- 빠른 확인: 앞에 `SAMPLES=16`

좌표는 build_store.py 와 같다 (x 오른쪽, y 매장 안쪽, z 위, 단위 m).
카메라 yaw 0 = 매장 안쪽(+y), 90 = 오른쪽(+x), -90 = 출입문 쪽(-x). pitch 는 위 +, 아래 -.
"""
import bpy, math, os, sys, runpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
WANT = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []

# build_store.py 를 렌더 없이 실행해 매장을 짓는다 (MODE 를 none 으로)
_argv = sys.argv
sys.argv = [sys.argv[0], "--", "none"]
S = runpy.run_path(os.path.join(HERE, "build_store.py"))
sys.argv = _argv

box, cyl, sphere, mat, M, render = S["box"], S["cyl"], S["sphere"], S["mat"], S["M"], S["render"]
scene = bpy.context.scene
OBJ = bpy.data.objects
W, H = 1920, 1080

# ------------------------------------------------------------------ 컷 전용 재질
C = dict(
    sleeve=mat("cut_sleeve", (0.42, 0.43, 0.45), rough=0.8),          # 회색 긴소매
    skin=mat("cut_skin", (0.78, 0.6, 0.5), rough=0.6),
    shoe=mat("cut_shoe", (0.05, 0.05, 0.06), rough=0.6),
    bag_a=mat("cut_bag_a", (0.85, 0.2, 0.15), rough=0.25, metal=0.3),  # 과자봉지 (반짝이는 비닐)
    bag_b=mat("cut_bag_b", (0.95, 0.75, 0.1), rough=0.25, metal=0.3),
    phone=mat("cut_phone", (0.02, 0.02, 0.025), rough=0.2),
    screen_on=mat("cut_screen_on", (1, 1, 1), emit=(0.85, 0.92, 1.0), emit_strength=3.0),
    screen_off=mat("cut_screen_off", (0.01, 0.01, 0.012), rough=0.03),
    water=mat("cut_water", (0.35, 0.4, 0.42), rough=0.02),
    wet=mat("cut_wet_print", (0.1, 0.11, 0.12), rough=0.03),
    wet_out=mat("cut_wet_out", (0.45, 0.48, 0.5), rough=0.02, metal=0.3),
    drop=mat("cut_drop", (0.55, 0.72, 0.8), rough=0.0, metal=0.6),     # 투명하면 렌더에서 안 보여 반사로 표시
    cardboard=mat("cut_cardboard", (0.55, 0.42, 0.28), rough=0.8),
    cable=mat("cut_cable", (0.03, 0.03, 0.03), rough=0.5),
    steel=mat("cut_lockbox", (0.45, 0.47, 0.5), rough=0.35, metal=0.8),
    occupied=mat("cut_occupied", (0.8, 0.05, 0.05), emit=(1, 0.1, 0.1), emit_strength=2),
    sidewalk=mat("cut_sidewalk", (0.18, 0.18, 0.19), rough=0.1),
    stripe=mat("cut_crosswalk", (0.75, 0.75, 0.72), rough=0.2),
    awning=mat("cut_awning", (0.0, 0.3, 0.29), rough=0.5),
    awning_light=mat("cut_awning_light", (1, 1, 1), emit=(0.92, 0.97, 1.0), emit_strength=8),
)

TMP = "cut_tmp"


def tmp_col():
    c = bpy.data.collections.get(TMP)
    if not c:
        c = bpy.data.collections.new(TMP)
        scene.collection.children.link(c)
    return c


def put(ob):
    """소품을 임시 모음으로 옮긴다 (컷이 끝나면 지움)"""
    for c in list(ob.users_collection):
        c.objects.unlink(ob)
    tmp_col().objects.link(ob)
    return ob


def tbox(name, x0, x1, y0, y1, z0, z1, m):
    return put(box("cut_" + name, x0, x1, y0, y1, z0, z1, m))


def tsphere(name, x, y, z, r, m):
    return put(sphere("cut_" + name, x, y, z, r, m))


def flat_oval(name, x, y, rx, ry, m, ang=0.0, z=0.0015):
    """바닥에 붙은 납작한 타원 (물기·발자국)"""
    ob = put(cyl("cut_" + name, x, y, 0.0, z, 1.0, m, seg=32))
    ob.scale = (rx, ry, 1)
    ob.rotation_euler = (0, 0, ang)
    return ob


def footprint(name, x, y, ang, m=None, s=1.0):
    """젖은 발자국 하나. ang = 발끝 방향(라디안, 0 = +y)"""
    m = m or C["wet"]
    d = Vector((-math.sin(ang), math.cos(ang), 0))
    flat_oval(name + "_sole", x + d.x * 0.04 * s, y + d.y * 0.04 * s, 0.05 * s, 0.085 * s, m, ang)
    flat_oval(name + "_heel", x - d.x * 0.09 * s, y - d.y * 0.09 * s, 0.038 * s, 0.05 * s, m, ang)


def chip_bag(name, x, y, z, m, lying=False, rz=0.0):
    ob = tbox(name, -0.1, 0.1, -0.03, 0.03, -0.14, 0.14, m)
    ob.location = (x, y, z)
    ob.rotation_euler = (math.radians(90) if lying else 0, 0, rz)
    if lying:
        ob.location.z = 0.03
    return ob


def rod(name, a, b, r, m):
    """두 점을 잇는 원기둥"""
    a, b = Vector(a), Vector(b)
    ob = put(cyl("cut_" + name, 0, 0, -0.5, 0.5, r, m, seg=16))
    ob.scale = (1, 1, (b - a).length)
    ob.location = (a + b) / 2
    ob.rotation_euler = (b - a).to_track_quat("Z", "Y").to_euler()
    return ob


# ------------------------------------------------------------------ 카메라
cam_data = bpy.data.cameras.new("Cam_Cut")
cam = bpy.data.objects.new("Cam_Cut", cam_data)
scene.collection.objects.link(cam)
cam_data.sensor_fit = "HORIZONTAL"
cam_data.sensor_width = 36
cam_data.clip_start = 0.02
cam_data.clip_end = 200


def aim(x, y, z, yaw, pitch, lens=22):
    cam.location = (x, y, z)
    cam.rotation_euler = (math.radians(90 + pitch), 0, math.radians(-yaw))
    cam_data.lens = lens
    bpy.context.view_layer.update()


def local(x, y, z):
    """카메라 기준 좌표 → 월드 (x 오른쪽, y 위, z 뒤 / 앞은 -z)"""
    return cam.matrix_world @ Vector((x, y, z))


def arm(name, target, side=1, hand=True):
    """화면 아래 바깥에서 target 까지 뻗은 아래팔 + 손 자리"""
    start = local(0.2 * side, -0.42, -0.05)
    rod(name + "_forearm", start, target, 0.045, C["sleeve"])
    if hand:
        tsphere(name + "_hand", *target, 0.05, C["skin"])


def hide(*names):
    for n in names:
        OBJ[n].hide_render = True


def hollow_counter():
    """계산대 아래를 직원 쪽에서 볼 수 있게 속을 비운다 (전선·박스·수납칸)"""
    hide("counter_base", "counter_kick")
    cb = M["counter_base"]
    tbox("cnt_front", -1.88, 2.38, 0.93, 0.98, 0.1, 0.91, cb)          # 손님 쪽 판 (바닥 10cm는 틈)
    for x in (-1.88, -0.9, 1.0, 2.34):
        tbox(f"cnt_part_{x}", x, x + 0.03, 0.45, 0.93, 0.0, 0.91, cb)
    tbox("cnt_shelf", -1.85, -0.9, 0.45, 0.93, 0.44, 0.46, cb)        # 왼쪽 칸 수납칸
    tbox("bags_stack", -1.75, -1.1, 0.55, 0.85, 0.46, 0.56, M["paper"])
    tbox("cardbox_1", -0.8, -0.45, 0.62, 0.9, 0.0, 0.22, C["cardboard"])
    tbox("cardbox_2", 1.15, 1.6, 0.55, 0.9, 0.0, 0.3, C["cardboard"])
    tbox("cardbox_3", 1.65, 2.0, 0.65, 0.9, 0.0, 0.16, C["cardboard"])
    # 전선: 위(POS)에서 내려와 바닥을 따라 깔림
    rod("cable_1", (-1.0, 0.88, 0.9), (-0.95, 0.86, 0.02), 0.006, C["cable"])
    rod("cable_2", (-0.95, 0.86, 0.01), (0.9, 0.915, 0.01), 0.006, C["cable"])
    rod("cable_3", (-0.92, 0.84, 0.9), (-0.7, 0.8, 0.012), 0.005, C["cable"])
    rod("cable_4", (-0.7, 0.8, 0.012), (0.6, 0.905, 0.012), 0.005, C["cable"])
    tbox("power_strip", 0.55, 0.85, 0.86, 0.92, 0.0, 0.04, M["paper"])


def door_open_front():
    """유리벽을 자동문 자리만 비워(문 열림) 다시 세우고, 바깥에 보도·처마·횡단보도를 둔다"""
    WALL_L, DOOR_Y = S["WALL_L"], S["DOOR_Y"]
    hide("glass_wall", "door_frame_2.9")
    g = M["glass"]
    tbox("glass_a", WALL_L - 0.02, WALL_L, S["WALL_BACK"], DOOR_Y[0], 0.05, S["CEIL"], g)
    tbox("glass_b", WALL_L - 0.02, WALL_L, DOOR_Y[1], S["BACK_MAIN"], 0.05, S["CEIL"], g)
    tbox("glass_over", WALL_L - 0.02, WALL_L, DOOR_Y[0], DOOR_Y[1], 2.4, S["CEIL"], g)
    # 열린 문짝: 양옆 고정 유리 뒤로 밀려 들어감
    tbox("door_leaf_a", WALL_L - 0.07, WALL_L - 0.05, DOOR_Y[0] - 0.85, DOOR_Y[0] + 0.05, 0.02, 2.4, g)
    tbox("door_leaf_b", WALL_L - 0.07, WALL_L - 0.05, DOOR_Y[1] - 0.05, DOOR_Y[1] + 0.85, 0.02, 2.4, g)
    tbox("sidewalk", -7.0, WALL_L - 0.05, -20, 40, -0.1, 0.0, C["sidewalk"])
    tbox("curb", -7.15, -7.0, -20, 40, -0.15, 0.0, M["counter_base"])
    for k in range(7):
        yy = 6.0 + k * 0.9
        tbox(f"crosswalk_{k}", -16.0, -7.4, yy, yy + 0.45, -0.1, -0.095, C["stripe"])
    tbox("awning", -5.6, WALL_L, S["WALL_BACK"] - 0.5, S["BACK_MAIN"] + 0.5, 2.62, 2.72, C["awning"])
    for yy in (0.0, 2.9, 6.0, 9.0):
        tbox(f"awning_lamp_{yy}", -4.9, -4.3, yy - 0.4, yy + 0.4, 2.6, 2.62, C["awning_light"])
    ld = bpy.data.lights.new("cut_awning_area", "AREA")
    ld.shape = "RECTANGLE"; ld.size = 1.8; ld.size_y = 12; ld.energy = 4000
    ld.color = (0.93, 0.97, 1.0)
    lo = bpy.data.objects.new(ld.name, ld)
    lo.location = (-4.6, 5.0, 2.55)
    tmp_col().objects.link(lo)


# ------------------------------------------------------------------ 컷 정의
# 각 함수가 카메라를 놓고 소품을 둔다. 반환값 없음.

def q1_pickup_1():
    # Q1: 가운데 통로, 오른쪽 진열대(gondola_M) 4단 깊숙이 봉지를 밀어 넣는 손
    aim(-1.1, 4.7, 1.6, 62, -20)
    tgt = Vector((0.2, 5.3, 1.2))
    chip_bag("bag_push", 0.3, 5.3, 1.2, C["bag_a"], rz=math.radians(90))
    arm("r", tgt, side=1)


def q1_pickup_2():
    # 같은 자리에서 발치를 내려다봄: 신발 앞에 봉지 두 개
    aim(-0.62, 5.2, 1.6, 80, -62)
    tbox("shoe_l", -0.66, -0.4, 5.27, 5.37, 0.0, 0.09, C["shoe"])
    tbox("shoe_r", -0.66, -0.4, 5.05, 5.15, 0.0, 0.09, C["shoe"])
    chip_bag("floor_a", -0.2, 5.28, 0, C["bag_a"], lying=True, rz=math.radians(20))
    chip_bag("floor_b", -0.12, 5.05, 0, C["bag_b"], lying=True, rz=math.radians(-35))


def q1a_box_1():
    # Q1-A: 계산대 오른쪽 날개 아래 검수함(bin_1)을 서랍처럼 앞으로 빼고 뚜껑을 연 채 봉지 두 개를 넣는 두 손
    aim(1.45, 0.15, 1.15, 90, -42)
    hide("bin_1", "bin_1_lid")
    x0, x1 = 2.12, 2.61                                   # 원래 자리(2.45–2.94)에서 33cm 앞으로
    tbox("bin_out", x0, x1, 0.0, 0.38, 0.08, 0.4, M["bin"])
    lid = tbox("lid_off", 0, 0.5, 0, 0.42, 0, 0.03, M["bin"])
    lid.location = (x0 - 0.02, 0.52, 0.0)
    lid.rotation_euler = (math.radians(80), 0, 0)         # 날개 옆면에 기대 세워 둠
    for i, (yy, m, side) in enumerate(((0.28, C["bag_a"], -1), (0.1, C["bag_b"], 1))):  # +y = 화면 왼쪽
        t = Vector(((x0 + x1) / 2, yy, 0.36))
        chip_bag(f"bag_{i}", t.x, t.y, t.z, m, rz=math.radians(90))
        arm(f"a{i}", t + Vector((-0.05, 0, 0.14)), side=side)


def q1a_box_2():
    # 같은 구도, 뚜껑 닫힌 검수함만
    aim(1.8, 0.05, 0.95, 90, -32)


def q2a_under():
    # Q2-A: 직원 쪽에서 쪼그려 계산대 아래를 봄. 통로 쪽 가장자리 바닥에 물방울 세 개 (화면 가운데)
    hollow_counter()
    aim(-0.15, -0.3, 0.6, 0, -24, lens=20)
    for i, (x, y) in enumerate(((-0.24, 0.8), (-0.14, 0.83), (-0.05, 0.79))):
        tsphere(f"drop_{i}", x, y, 0.01, 0.02, C["drop"]).scale = (1, 1, 0.55)


def q4_phone_1():
    # Q4: 계산대 아래(직원 쪽) 바닥에 화면이 켜진 휴대폰, 손이 다가감
    hollow_counter()
    aim(0.0, -0.15, 1.35, 0, -58)
    ph = tbox("phone", -0.038, 0.038, -0.08, 0.08, 0.0, 0.009, C["phone"])
    ph.location = (0.18, 0.62, 0.0)
    ph.rotation_euler = (0, 0, math.radians(25))
    sc = tbox("phone_scr", -0.034, 0.034, -0.074, 0.074, 0.009, 0.01, C["screen_on"])
    sc.location = ph.location
    sc.rotation_euler = ph.rotation_euler
    arm("r", Vector((0.08, 0.42, 0.35)), side=1)


def q4_phone_2():
    # 휴대폰을 들어 화면을 봄. 화면은 비워 두고 q4-photo 를 합성
    aim(0.0, 0.0, 1.55, 0, -30, lens=30)
    held_phone(local(0.0, -0.03, -0.36), on=True)
    arm("r", local(0.01, -0.12, -0.37), side=1)


def held_phone(p, on):
    """카메라를 정면으로 보는 손에 든 휴대폰 (화면 = -y 면)"""
    ph = tbox("phone", -0.038, 0.038, -0.004, 0.004, -0.08, 0.08, C["phone"])
    sc = tbox("phone_scr", -0.034, 0.034, -0.0045, -0.004, -0.074, 0.074, C["screen_on"] if on else C["screen_off"])
    for o in (ph, sc):
        o.location = p
        o.rotation_euler = cam.rotation_euler.copy()
        o.rotation_euler.x -= math.radians(90)


LOCK = (2.5, 2.9, -0.42, -0.08, 0.5, 0.76)                # 날개 아래 선반 위 작은 금고형 분실물 보관함


def lockbox(open_):
    """앞(직원 쪽, x0)에 여닫이 문이 달린 금속 보관함. 문 경첩은 y0 쪽"""
    x0, x1, y0, y1, z0, z1 = LOCK
    tbox("lock_back", x0 + 0.02, x1, y0, y1, z0, z1, C["steel"])
    tbox("lock_inside", x0 + 0.02, x0 + 0.03, y0 + 0.02, y1 - 0.02, z0 + 0.02, z1 - 0.02, M["dark"])
    door = tbox("lock_door", -0.02, 0, 0, y1 - y0, 0, z1 - z0, C["steel"])
    door.location = (x0 + 0.02, y0, z0)
    if open_:
        hide("cut_lock_inside")
        tbox("lock_hollow", x0 + 0.02, x1 - 0.02, y0 + 0.02, y1 - 0.02, z0 + 0.02, z1 - 0.02, M["dark"])
        door.rotation_euler = (0, 0, math.radians(105))   # 직원 쪽으로 활짝 열림
    else:
        yc, zc = (y0 + y1) / 2, (z0 + z1) / 2
        tbox("lock_keyhole", x0 - 0.005, x0, yc + 0.08, yc + 0.11, zc - 0.03, zc + 0.03, M["chrome"])


def q4a_lock_1():
    # Q4-A: 열린 보관함 안으로 휴대폰을 화면이 아래로 가게 밀어 넣는 손
    aim(1.8, -0.15, 1.05, 90, -28, lens=24)
    lockbox(True)
    ph = tbox("phone", -0.08, 0.08, -0.038, 0.038, 0, 0.009, C["phone"])
    ph.location = (2.56, -0.25, 0.54)
    arm("r", Vector((2.46, -0.25, 0.57)), side=1)


def q4a_lock_2():
    # 닫힌 보관함, 문 열쇠를 돌리는 손가락
    aim(1.85, -0.2, 0.9, 90, -14, lens=30)
    lockbox(False)
    yc, zc = (LOCK[2] + LOCK[3]) / 2 + 0.095, (LOCK[4] + LOCK[5]) / 2
    rod("key", (LOCK[0] - 0.005, yc, zc), (LOCK[0] - 0.05, yc, zc), 0.006, M["chrome"])
    arm("r", Vector((LOCK[0] - 0.08, yc, zc)), side=1)


def restroom(prints):
    WALL_R, COR_END, COR_Y = S["WALL_R"], S["COR_END"], S["COR_Y"]
    aim(4.25, 1.7, 0.55, 90, -9)
    tbox("occupied", COR_END - 0.04, COR_END - 0.03, COR_Y[1] - 0.24, COR_Y[1] - 0.18, 1.05, 1.08, C["occupied"])
    # 문 아래로 새어 나온 얇은 물막
    flat_oval("water_main", COR_END - 0.25, 1.7, 0.3, 0.42, C["water"])
    flat_oval("water_tongue", COR_END - 0.55, 1.62, 0.22, 0.18, C["water"])
    if prints:
        footprint("fp_1", 5.55, 1.8, math.radians(90), s=1.25)                       # 발끝 = -x (카메라 쪽)
        footprint("fp_2", 4.95, 1.6, math.radians(90), m=mat("cut_wet_faint", (0.3, 0.32, 0.33), rough=0.05), s=1.25)


def q5d_door_1():
    restroom(False)


def q5d_door_2():
    restroom(True)


def go_out_1():
    # Q7-A/B: 열린 자동문을 지나 처마 아래로 나가는 1인칭
    door_open_front()
    aim(-2.3, 2.9, 1.6, -90, -6)


def go_out_2():
    # 처마 아래에서 돌아서 통유리 너머 밝은 매장(계산대·호출벨)을 봄
    door_open_front()
    aim(-5.7, 2.2, 1.6, 78, -4, lens=20)


def exit_door_1():
    # Q8-IN-B: 자동문을 지나 보도로 나서는 순간, 빈 새벽 도로
    door_open_front()
    aim(-3.2, 2.9, 1.6, -95, -10)


def exit_door_2():
    # 어깨 너머 돌아봄: 반쯤 닫히는 유리문, 매트와 보도 위 내 것이 아닌 젖은 발자국
    door_open_front()
    hide("cut_door_leaf_a", "cut_door_leaf_b")
    g = M["glass"]
    WALL_L, DOOR_Y = S["WALL_L"], S["DOOR_Y"]
    tbox("door_half_a", WALL_L - 0.07, WALL_L - 0.05, DOOR_Y[0] - 0.4, DOOR_Y[0] + 0.5, 0.02, 2.4, g)
    tbox("door_half_b", WALL_L - 0.07, WALL_L - 0.05, DOOR_Y[1] - 0.5, DOOR_Y[1] + 0.4, 0.02, 2.4, g)
    aim(-5.6, 1.9, 1.6, 62, -14)
    for i, (x, y) in enumerate(((-2.85, 3.05), (-3.25, 2.8), (-3.7, 2.95), (-4.15, 2.75), (-4.6, 2.9))):
        footprint(f"fp_{i}", x, y, math.radians(90), m=C["wet"] if x > S["WALL_L"] else C["wet_out"], s=1.1)


def exit_reflection(on):
    door_open_front()
    aim(-5.4, 14.0, 1.6, 4, -34, lens=26)
    held_phone(local(0.0, -0.04, -0.36), on)
    arm("r", local(0.01, -0.13, -0.37), side=1)


CUTS = {
    "q1-pickup": [q1_pickup_1, q1_pickup_2],
    "q1a-box": [q1a_box_1, q1a_box_2],
    "q2a-under": [q2a_under],
    "q4-phone": [q4_phone_1, q4_phone_2],
    "q4a-lock": [q4a_lock_1, q4a_lock_2],
    "q5d-door": [q5d_door_1, q5d_door_2],
    "go-out": [go_out_1, go_out_2],
    "exit-door": [exit_door_1, exit_door_2],
    "exit-reflection": [lambda: exit_reflection(True), lambda: exit_reflection(False)],
}


def reset():
    c = bpy.data.collections.get(TMP)
    if c:
        for o in list(c.objects):
            bpy.data.objects.remove(o, do_unlink=True)
    for o in OBJ:
        if not o.name.startswith("cut_"):
            o.hide_render = False


os.makedirs(os.path.join(S["OUT"], "cuts"), exist_ok=True)
for cid, frames in CUTS.items():
    if WANT and cid not in WANT:
        continue
    for n, fn in enumerate(frames, 1):
        reset()
        fn()
        tag = f"cuts/{cid}" if len(frames) == 1 else f"cuts/{cid}.{n}"
        render(cam, W, H, tag)
        print("CUT", tag)
reset()
print("DONE cuts")
