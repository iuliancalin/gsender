; =========================================
; MATERIAL CENTER FINDER MACRO (Metric / mm)
; =========================================
%wait

; --- USER CONFIGURABLE DIMENSIONS (mm) ---
%STOCK_X = 100          ; Material Width in X (mm)
%STOCK_Y = 50           ; Material Length in Y (mm)
%PROBE_FEED_FAST = 150  ; Fast probing feedrate (mm/min)
%PROBE_FEED_SLOW = 50   ; Slow precision probing feedrate (mm/min)
%PROBE_RETRACT = 2.0    ; Retract distance after touch (mm)
%Z_SAFE_LIFT = 5.0      ; Clearance lift above surface (mm)
%Z_UNDER_SURFACE = -4   ; Depth below top surface to probe side edges (mm)
%EDGE_MARGIN_MAJOR = 10 ; Hop clearance over boundary (mm)
%EDGE_MARGIN = 5        ; Probe search stroke buffer (mm)

; --- PRESERVE MODAL STATE ---
%UNITS=modal.units
%DISTANCE=modal.distance

G91
G21

; =========================================
; 1. PROBE Z TOP SURFACE
; =========================================
G38.2 Z-50 F[PROBE_FEED_FAST]
G0 Z[PROBE_RETRACT]
G38.2 Z-5 F[PROBE_FEED_SLOW]
G0 Z[PROBE_RETRACT]
G4 P1
G10 L20 P0 Z[PROBE_RETRACT]

%Z_LIFT_TOTAL = Z_SAFE_LIFT - Z_UNDER_SURFACE
G0 Z[Z_LIFT_TOTAL]

; =========================================
; 2. PROBE X EDGES (RIGHT & LEFT)
; =========================================
; Move to Right edge & drop down
G0 X[ STOCK_X/2 + EDGE_MARGIN_MAJOR ]
G0 Z-[Z_LIFT_TOTAL - Z_UNDER_SURFACE]

; Probe Right edge
G38.2 X-[ STOCK_X + 2*EDGE_MARGIN ] F[PROBE_FEED_FAST]
G0 X[PROBE_RETRACT]
G38.2 X-5 F[PROBE_FEED_SLOW]
%X_RIGHT = posx
G0 X[PROBE_RETRACT]
G0 Z[Z_LIFT_TOTAL]

; Move across to Left edge & drop down
G0 X-[ STOCK_X + 2*EDGE_MARGIN ]
G0 Z-[Z_LIFT_TOTAL]

; Probe Left edge
G38.2 X[ STOCK_X + 2*EDGE_MARGIN ] F[PROBE_FEED_FAST]
G0 X-[PROBE_RETRACT]
G38.2 X5 F[PROBE_FEED_SLOW]
%X_LEFT = posx
G0 X-[PROBE_RETRACT]
G0 Z[Z_LIFT_TOTAL]

; Calculate X center and zero X on active WCS (P0)
%X_CHORD = X_RIGHT - X_LEFT
G10 L20 P0 X[X_LEFT]
G0 X[X_CHORD/2 + PROBE_RETRACT]
%X_CENTER = posx
G4 P1
G10 L20 P0 X0

; =========================================
; 3. PROBE Y EDGES (BACK/TOP & FRONT/BOTTOM)
; =========================================
; Move to Top/Back edge & drop down
G0 Y[ STOCK_Y/2 + EDGE_MARGIN_MAJOR ]
G0 Z-[Z_LIFT_TOTAL]

; Probe Top/Back edge
G38.2 Y-[ STOCK_Y + 2*EDGE_MARGIN ] F[PROBE_FEED_FAST]
G0 Y[PROBE_RETRACT]
G38.2 Y-5 F[PROBE_FEED_SLOW]
%Y_TOP = posy
G0 Y[PROBE_RETRACT]
G0 Z[Z_LIFT_TOTAL]

; Move across to Bottom/Front edge & drop down
G0 Y-[ STOCK_Y + 2*EDGE_MARGIN ]
G0 Z-[Z_LIFT_TOTAL]

; Probe Bottom/Front edge
G38.2 Y[ STOCK_Y + 2*EDGE_MARGIN ] F[PROBE_FEED_FAST]
G0 Y-[PROBE_RETRACT]
G38.2 Y5 F[PROBE_FEED_SLOW]
%Y_BTM = posy
G0 Y-[PROBE_RETRACT]
G0 Z[Z_LIFT_TOTAL]

; Calculate Y center and zero Y on active WCS (P0)
%Y_CHORD = Y_TOP - Y_BTM
G10 L20 P0 Y[Y_BTM]
G0 Y[Y_CHORD/2 + PROBE_RETRACT]
%Y_CENTER = posy
G4 P1
G10 L20 P0 Y0

(MSG, MATERIAL_CENTER_DONE)

; --- RESTORE INITIAL MODAL STATE ---
[UNITS] [DISTANCE]
