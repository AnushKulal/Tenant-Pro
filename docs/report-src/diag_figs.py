# Figure bodies.
#
# Sizing rule for all five: every figure is placed in a column about 6 inches
# wide, so a label has to be roughly 2% of the canvas width to print at 9 pt.
# The canvases below are 1200-1450 px with 26-32 px type, which lands there.
# Keep that ratio in mind before adding anything to a figure.
from diag_head import (BAND, INK, LINE, SOFT, actor, box, diamond, ellipse,
                       flow_label, label, line, poly, rounded, store, txt, write)

T_SHAPE = 29      # text inside a shape
T_SMALL = 25      # text inside a smaller shape
T_FLOW = 23       # flow and association captions
T_NOTE = 24       # the italic note under a figure


# ------------------------------------------------------------- Fig 4.2 use case
def use_case():
    """Actors in the top corners so every association fans downward, and the two
    external systems reached through the corridor between the columns."""
    W, H = 1440, 1250
    s = []
    s.append(f'<rect x="258" y="66" width="904" height="962" rx="16" fill="#ffffff" '
             f'stroke="{LINE}" stroke-width="3.4"/>')
    s.append(txt(710, 100, "TenantPro", size=32, weight="bold"))
    s.append(ellipse(710, 182, 215, 48, ["Sign in and hold a session"], size=T_SMALL))

    left = [["Manage properties", "and rooms"],
            ["Manage tenants and", "room assignments"],
            ["Review join requests"],
            ["Confirm or reject", "a payment"],
            ["Connect a payment", "gateway"],
            ["Handle maintenance", "threads"],
            ["Send reminders", "and alerts"]]
    right = [["View dues and", "payment history"],
             ["Declare a UPI", "payment"],
             ["Pay through the", "gateway"],
             ["Raise a maintenance", "request"],
             ["Upload ID documents"],
             ["Give notice"]]
    ly = [288, 404, 520, 636, 752, 868, 955]
    ly = [285, 400, 515, 630, 745, 860, 952]
    ry = [285, 400, 515, 630, 745, 860]
    lx, rx = 475, 945
    for y, t in zip(ly, left):
        s.append(ellipse(lx, y, 205, 50, t, size=T_SMALL))
    for y, t in zip(ry, right):
        s.append(ellipse(rx, y, 205, 50, t, size=T_SMALL))

    s.append(actor(104, 180, ["Landlord"], size=T_SHAPE))
    s.append(actor(1336, 180, ["Tenant"], size=T_SHAPE))
    s.append(box(400, 1168, 310, 84, ["Payment Gateway", "«external»"], size=T_SMALL, fill=BAND))
    s.append(box(1020, 1168, 330, 84, ["Messaging Services", "«external»"], size=T_SMALL, fill=BAND))

    s.append(line(136, 182, 495, 182, arrow=False))
    s.append(line(1304, 182, 925, 182, arrow=False))
    for y in ly:
        s.append(line(136, 212, lx - 205, y, arrow=False))
    for y in ry:
        s.append(line(1304, 212, rx + 205, y, arrow=False))

    s.append(poly([(lx + 205, 745), (686, 745), (686, 1118), (400, 1126)], arrow=False))
    s.append(poly([(rx - 205, 515), (734, 515), (734, 1118), (470, 1126)], arrow=False))
    s.append(poly([(lx + 205, 952), (800, 952), (800, 1118), (960, 1126)], arrow=False))
    s.append(flow_label(676, 1072, "verify credentials", size=T_FLOW, anchor="end"))
    s.append(flow_label(744, 1108, "create and check payment link", size=T_FLOW, anchor="start"))
    s.append(flow_label(812, 1072, "deliver messages", size=T_FLOW, anchor="start"))
    write("fig_use_case.svg", W, H, "\n".join(s))


# ----------------------------------------------------------- Fig 4.3 activity
def activity():
    W, H = 1300, 1360
    s = []
    cx, lx, rx = 650, 316, 984
    s.append(f'<circle cx="{cx}" cy="56" r="20" fill="{INK}"/>')
    s.append(box(cx, 142, 450, 70, ["Tenant opens the payment screen"], size=T_SHAPE))
    s.append(line(cx, 76, cx, 105))
    s.append(diamond(cx, 282, 420, 130, ["Has the landlord", "connected a gateway?"], size=T_SMALL))
    s.append(line(cx, 177, cx, 215))

    s.append(line(cx - 210, 282, lx, 282, arrow=False))
    s.append(line(lx, 282, lx, 400))
    s.append(flow_label(430, 262, "no", size=T_SHAPE))
    s.append(box(lx, 444, 500, 88, ["Tenant pays by UPI to the", "landlord's own address"], size=T_SHAPE))
    s.append(line(lx, 488, lx, 566))
    s.append(box(lx, 610, 500, 88, ["Tenant declares the payment", "with its reference"], size=T_SHAPE))
    s.append(line(lx, 654, lx, 732))
    s.append(box(lx, 776, 500, 88, ["Row stored as Declared:", "a claim that clears nothing"], size=T_SHAPE))
    s.append(line(lx, 820, lx, 862))
    s.append(diamond(lx, 950, 420, 130, ["Landlord confirms?"], size=T_SMALL))

    s.append(line(lx - 210, 950, 92, 950, arrow=False))
    s.append(line(92, 950, 92, 1038))
    s.append(flow_label(190, 930, "no", size=T_SHAPE))
    s.append(box(92, 1086, 180, 96, ["Rejected,", "with a", "reason"], size=T_SMALL))
    s.append(line(92, 1134, 92, 1188))
    s.append(f'<circle cx="92" cy="1222" r="24" fill="none" stroke="{INK}" stroke-width="3.6"/>')
    s.append(f'<circle cx="92" cy="1222" r="14" fill="{INK}"/>')

    s.append(line(cx + 210, 282, rx, 282, arrow=False))
    s.append(line(rx, 282, rx, 400))
    s.append(flow_label(880, 262, "yes", size=T_SHAPE))
    s.append(box(rx, 444, 500, 88, ["Server creates a Payment Link", "on the landlord's credentials"], size=T_SHAPE))
    s.append(line(rx, 488, rx, 566))
    s.append(box(rx, 610, 500, 88, ["Tenant pays on the gateway's", "hosted page"], size=T_SHAPE))
    s.append(line(rx, 654, rx, 732))
    s.append(box(rx, 776, 500, 88, ["Server asks the gateway,", "server to server"], size=T_SHAPE))
    s.append(line(rx, 820, rx, 862))
    s.append(diamond(rx, 950, 420, 130, ["Gateway says paid?"], size=T_SMALL))
    s.append(poly([(rx + 210, 950), (1256, 950), (1256, 610), (rx + 250, 610)]))
    s.append(flow_label(1180, 930, "not yet", size=T_SHAPE, anchor="end"))

    s.append(f'<rect x="270" y="1038" width="760" height="12" fill="{INK}"/>')
    s.append(line(lx + 210, 950, lx + 210, 1034, arrow=False))
    s.append(flow_label(lx + 262, 930, "yes", size=T_SHAPE))
    s.append(line(rx, 1015, rx, 1034, arrow=False))
    s.append(flow_label(rx + 58, 1008, "yes", size=T_SHAPE))
    s.append(line(cx, 1050, cx, 1098))
    s.append(box(cx, 1168, 820, 108,
                 ["settlePayment: the status becomes Confirmed and the next",
                  "due date advances, both inside one transaction"], size=T_SHAPE, fill=BAND))
    s.append(line(cx, 1222, cx, 1262))
    s.append(box(cx, 1302, 660, 62, ["Both sides see the same state"], size=T_SHAPE))
    write("fig_activity.svg", W, H, "\n".join(s))


# ------------------------------------------------------------ Fig 4.4 DFD 0
def dfd0():
    W, H = 1340, 800
    s = []
    cx, cy = 670, 372
    s.append(f'<circle cx="{cx}" cy="{cy}" r="178" fill="{SOFT}" stroke="{LINE}" stroke-width="3.4"/>')
    s.append(txt(cx, cy - 34, "0", size=40, weight="bold"))
    s.append(txt(cx, cy + 26, ["TenantPro", "System"], size=T_SHAPE, weight="bold"))

    s.append(box(160, 150, 290, 86, ["Landlord"], size=T_SHAPE, sw=3.4))
    s.append(box(160, 594, 290, 86, ["Tenant"], size=T_SHAPE, sw=3.4))
    s.append(box(1180, 150, 300, 86, ["Payment Gateway"], size=T_SMALL, sw=3.4))
    s.append(box(1180, 594, 300, 86, ["Messaging Services"], size=T_SMALL, sw=3.4))

    s.append(poly([(305, 128), (470, 128), (534, 272)]))
    s.append(flow_label(430, 112, "portfolio, tenants, confirmations", size=T_FLOW))
    s.append(poly([(540, 310), (450, 186), (305, 186)]))
    s.append(flow_label(410, 212, "dues, ledger, alerts", size=T_FLOW))
    s.append(poly([(305, 616), (470, 616), (534, 472)]))
    s.append(flow_label(430, 648, "join request, payment, tickets", size=T_FLOW))
    s.append(poly([(540, 434), (450, 558), (305, 558)]))
    s.append(flow_label(412, 540, "dues, receipts, alerts", size=T_FLOW))
    s.append(poly([(806, 272), (870, 128), (1030, 128)]))
    s.append(flow_label(916, 112, "create link, verify", size=T_FLOW))
    s.append(poly([(1030, 186), (870, 186), (800, 310)]))
    s.append(flow_label(930, 212, "link URL, status", size=T_FLOW))
    s.append(poly([(806, 472), (870, 616), (1030, 616)]))
    s.append(flow_label(922, 648, "reminder and alert text", size=T_FLOW))
    s.append(poly([(1030, 558), (870, 558), (800, 434)]))
    s.append(flow_label(930, 540, "delivery status", size=T_FLOW))

    s.append(label(670, 752, "No flow on this diagram carries money: the gateway settles "
                             "directly to the landlord.", size=T_NOTE, italic=True))
    write("fig_dfd0.svg", W, H, "\n".join(s))


# ------------------------------------------------------------ Fig 4.5 DFD 1
def dfd1():
    """Entities left, processes in one column, stores right. The two external
    services are left to the context diagram so this one stays readable."""
    W, H = 1400, 1180
    s = []
    PX, PW = 620, 430
    pl, pr = PX - PW / 2, PX + PW / 2
    procs = [(130, "1.0", ["Authentication", "and Sessions"]),
             (335, "2.0", ["Portfolio and", "Tenancy Management"]),
             (560, "3.0", ["Payment and", "Confirmation"]),
             (785, "4.0", ["Notifications", "and Reminders"]),
             (990, "5.0", ["Maintenance Requests"])]
    for y, num, lines in procs:
        s.append(f'<rect x="{pl}" y="{y-66}" width="{PW}" height="132" rx="66" '
                 f'fill="{SOFT}" stroke="{LINE}" stroke-width="3"/>')
        s.append(txt(PX, y - 32, num, size=32, weight="bold"))
        s.append(txt(PX, y + 24, lines, size=T_SMALL))

    s.append(box(130, 240, 230, 86, ["Landlord"], size=T_SHAPE, sw=3.4))
    s.append(box(130, 800, 230, 86, ["Tenant"], size=T_SHAPE, sw=3.4))

    SX, SW = 1150, 460
    sl = SX - SW / 2
    stores = [(130, "D1", "Accounts"), (265, "D2", "Sessions"),
              (400, "D3", "Properties, Rooms"), (535, "D4", "Tenancies"),
              (670, "D5", "Payments"), (830, "D6", "Notifications"),
              (990, "D7", "Maintenance")]
    for y, tag, name in stores:
        s.append(store(SX, y, SW, 74, tag, [name], size=T_SMALL))

    s.append(poly([(245, 212), (300, 212), (300, 130), (pl, 130)]))
    s.append(poly([(245, 252), (340, 252), (340, 310), (pl, 310)]))
    s.append(poly([(245, 272), (278, 272), (278, 530), (pl, 530)]))
    s.append(flow_label(286, 476, "confirm or reject", size=T_FLOW, anchor="start"))
    s.append(poly([(245, 776), (262, 776), (262, 100), (pl, 100)]))
    s.append(poly([(245, 820), (320, 820), (320, 590), (pl, 590)]))
    s.append(flow_label(328, 646, "declare payment", size=T_FLOW, anchor="start"))
    s.append(poly([(245, 840), (300, 840), (300, 990), (pl, 990)]))
    s.append(flow_label(308, 944, "raise a ticket", size=T_FLOW, anchor="start"))

    # every store feed runs in its own lane between the process column (pr) and
    # the stores (sl); a lane right of sl would be drawn on top of the stores
    s.append(line(pr, 130, sl, 130, both=True))
    s.append(poly([(pr, 176), (855, 176), (855, 265), (sl, 265)]))
    s.append(poly([(pr, 310), (875, 310), (875, 400), (sl, 400)]))
    s.append(poly([(pr, 360), (898, 360), (898, 518), (sl, 518)]))
    s.append(poly([(pr, 540), (898, 540), (898, 552), (sl, 552)], arrow=False, dash="7 6"))
    s.append(poly([(pr, 600), (865, 600), (865, 670), (sl, 670)]))
    s.append(line(pr, 830, sl, 830))
    s.append(line(pr, 990, sl, 990))

    s.append(line(PX, 401, PX, 490))
    s.append(flow_label(PX + 14, 455, "tenancy and rent", size=T_FLOW, anchor="start"))
    s.append(line(PX, 626, PX, 715))
    s.append(flow_label(PX + 14, 680, "settled or rejected", size=T_FLOW, anchor="start"))
    s.append(line(PX - 150, 924, PX - 150, 855))
    s.append(flow_label(PX - 162, 898, "reply raised", size=T_FLOW, anchor="end"))

    s.append(label(700, 1128, "Dashed: process 3.0 reads tenancy rows and is the only process "
                              "that advances a due date.", size=T_NOTE, italic=True))
    write("fig_dfd1.svg", W, H, "\n".join(s))


# -------------------------------------------------------------- Fig 4.6 ERD
def erd():
    W, H = 1420, 1120
    s = []
    AT = 24

    def ent(x, y, name, rows, w=390):
        h = 64 + len(rows) * 42
        s.append(f'<rect x="{x-w/2}" y="{y-h/2}" width="{w}" height="{h}" rx="6" '
                 f'fill="#ffffff" stroke="{LINE}" stroke-width="3"/>')
        s.append(f'<rect x="{x-w/2}" y="{y-h/2}" width="{w}" height="62" rx="6" fill="{BAND}"/>')
        s.append(f'<line x1="{x-w/2}" y1="{y-h/2+62}" x2="{x+w/2}" y2="{y-h/2+62}" '
                 f'stroke="{LINE}" stroke-width="3"/>')
        s.append(txt(x, y - h / 2 + 31, name, size=28, weight="bold"))
        for i, r in enumerate(rows):
            s.append(f'<text x="{x-w/2+20}" y="{y-h/2+62+36+i*42}" font-size="{AT}" '
                     f'fill="{INK}">{r}</text>')
        return h

    h_own = ent(225, 130, "owners", ["id (PK)", "email, name"])
    h_prop = ent(225, 390, "properties", ["id (PK)", "owner_id (FK)", "name, address"])
    h_unit = ent(225, 700, "units", ["id (PK)", "property_id (FK)", "number, rent"])
    h_tu = ent(710, 300, "tenant_users", ["id (PK)", "tenant_id (FK)", "email, is_guest"])
    h_ten = ent(710, 700, "tenants", ["id (PK)", "owner_id, unit_id (FK)",
                                      "rent_share, deposit", "next_due_date"])
    h_pay = ent(1180, 700, "payments", ["id (PK)", "tenant_id (FK)", "amount, status",
                                        "due_date_settled"], w=390)
    h_req = ent(1180, 1000, "maint_requests", ["id (PK)", "tenant_id (FK)", "status"], w=390)
    h_gw = ent(710, 100, "gateway_credentials", ["owner_id (FK)", "sealed key, secret"])
    h_ses = ent(1180, 330, "sessions", ["id (PK)", "token_hash", "account_kind, account_id"],
                w=390)

    def rel(points, a, b):
        s.append(poly(points, arrow=False, width=3))
        s.append(flow_label(points[0][0] + a[0], points[0][1] + a[1], a[2], size=26))
        s.append(flow_label(points[-1][0] + b[0], points[-1][1] + b[1], b[2], size=26))

    rel([(225, 130 + h_own / 2), (225, 390 - h_prop / 2)], (24, 34, "1"), (24, -28, "N"))
    rel([(225, 390 + h_prop / 2), (225, 700 - h_unit / 2)], (24, 34, "1"), (24, -28, "N"))
    rel([(420, 700), (515, 700)], (34, -18, "1"), (-34, -18, "N"))
    rel([(710, 300 + h_tu / 2), (710, 700 - h_ten / 2)], (24, 34, "1"), (24, -28, "1"))
    rel([(905, 700), (985, 700)], (34, -18, "1"), (-34, -18, "N"))
    rel([(905, 760), (1040, 1000), (985, 1000)], (40, 14, "1"), (-34, -18, "N"))
    rel([(420, 100), (515, 100)], (34, -18, "1"), (-34, -18, "1"))
    s.append(poly([(905, 150), (1040, 150), (1040, 330 - h_ses / 2)], arrow=False, dash="8 6", width=3))
    s.append(flow_label(1052, 190, "a session row names an", size=AT, anchor="start"))
    s.append(flow_label(1052, 224, "account kind and id, so it", size=AT, anchor="start"))
    s.append(flow_label(1052, 258, "belongs to either table", size=AT, anchor="start"))
    write("fig_erd.svg", W, H, "\n".join(s))




# ------------------------------------------- Fig 4.3 whole-system activity
LANES = [("Landlord", 250), ("TenantPro System", 710), ("Tenant", 1160)]
LANE_EDGES = [20, 480, 940, 1380]


def _router(src, dst, nodes):
    """Orthogonal arrow from the bottom of one node to the top of the next.
    Same lane gives a straight drop; a lane change gives one elbow halfway."""
    x1, y1, h1 = nodes[src]
    x2, y2, h2 = nodes[dst]
    a, b = y1 + h1 / 2, y2 - h2 / 2
    if x1 == x2:
        return line(x1, a, x2, b)
    mid = (a + b) / 2
    return poly([(x1, a), (x1, mid), (x2, mid), (x2, b)])


def system_activity():
    """The whole lifecycle across three swimlanes, from registration through to
    a tenancy ending. The payment branch is drawn in detail in Fig 4.4."""
    W, H = 1400, 2160
    s = []
    top, bot = 92, H - 24
    for i, (name, cx) in enumerate(LANES):
        x0, x1 = LANE_EDGES[i], LANE_EDGES[i + 1]
        s.append(f'<rect x="{x0}" y="26" width="{x1-x0}" height="66" fill="{BAND}" '
                 f'stroke="{LINE}" stroke-width="3"/>')
        s.append(txt(cx, 59, name, size=30, weight="bold"))
        s.append(f'<rect x="{x0}" y="92" width="{x1-x0}" height="{bot-top}" fill="none" '
                 f'stroke="{LINE}" stroke-width="3"/>')

    L, S, T = 250, 710, 1160
    BW, BH = 400, 88
    nodes = {}

    def node(key, x, y, lines, h=BH, fill="#ffffff"):
        nodes[key] = (x, y, h)
        s.append(box(x, y, BW, h, lines, size=27, fill=fill))

    def dec(key, x, y, lines, h=130):
        nodes[key] = (x, y, h)
        s.append(diamond(x, y, 420, h, lines, size=25))

    s.append(f'<circle cx="{L}" cy="140" r="20" fill="{INK}"/>')
    nodes["start"] = (L, 140, 40)

    node("signin", L, 232, ["Register and sign in"])
    node("token", S, 350, ["Issue an access token and", "a refresh token"])
    node("portfolio", L, 468, ["Create properties and rooms"])
    node("join", T, 586, ["Join by invite code and", "upload an ID proof"])
    node("review", L, 704, ["Review the join request"])
    dec("accept", L, 840, ["Accept?"])
    node("declined", T, 840, ["Declined, with a reason", "the tenant reads"])
    node("assign", L, 986, ["Assign a room; set the rent,", "deposit and start date"])
    node("due", S, 1104, ["Derive the due date from", "the tenancy start date"])
    node("remind", S, 1222, ["Daily job: remind whoever", "is due across the channels"])
    node("view", T, 1340, ["View dues, then pay by UPI", "or through the gateway"])
    dec("vouched", S, 1480, ["Vouched for by the landlord", "or by the gateway?"], h=150)
    node("pending", L, 1480, ["Rejected, or still a claim", "awaiting confirmation"])
    node("settle", S, 1628, ["settlePayment: confirm and", "advance the due date"], fill=BAND)
    node("ledger", L, 1746, ["Ledger and collection", "figures update"])
    node("notice", T, 1864, ["Raise maintenance requests;", "give notice to leave"])
    node("end", S, 1982, ["Leave date computed; the", "room returns to vacant"])

    for a, b in [("start", "signin"), ("signin", "token"), ("token", "portfolio"),
                 ("portfolio", "join"), ("join", "review"), ("review", "accept"),
                 ("accept", "assign"), ("assign", "due"), ("due", "remind"),
                 ("remind", "view"), ("view", "vouched"), ("vouched", "settle"),
                 ("settle", "ledger"), ("ledger", "notice"), ("notice", "end")]:
        s.append(_router(a, b, nodes))

    s.append(line(L + 210, 840, T - 200, 840))
    s.append(flow_label(T - 300, 820, "no", size=27))
    s.append(flow_label(L + 44, 924, "yes", size=27, anchor="start"))
    s.append(line(S - 210, 1480, L + 200, 1480))
    s.append(flow_label(L + 236, 1460, "no", size=27))
    s.append(flow_label(S + 44, 1570, "yes", size=27, anchor="start"))

    def stop(x, y):
        s.append(f'<circle cx="{x}" cy="{y}" r="24" fill="none" stroke="{INK}" stroke-width="3.6"/>')
        s.append(f'<circle cx="{x}" cy="{y}" r="14" fill="{INK}"/>')

    # every branch has to finish somewhere, including the two that stop early
    s.append(line(T, 884, T, 952))
    stop(T, 986)
    s.append(line(L, 1524, L, 1592))
    stop(L, 1626)
    s.append(line(S, 2026, S, 2068))
    stop(S, 2102)
    write("fig_system_activity.svg", W, H, "\n".join(s))


if __name__ == "__main__":
    use_case()
    system_activity()
    activity()
    dfd0()
    dfd1()
    erd()
