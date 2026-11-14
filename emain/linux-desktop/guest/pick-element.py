# Copyright 2026, Command Line Inc.
# SPDX-License-Identifier: Apache-2.0

import ctypes as c
import glob
import json
import os
import sys

x, y = map(int, sys.argv[1:3])
for proc in glob.glob("/proc/[0-9]*/comm"):
    try:
        with open(proc) as name:
            if name.read().strip() != "cua-driver":
                continue
        with open(proc.removesuffix("comm") + "environ", "rb") as env:
            bus = next((item.split(b"=", 1)[1] for item in env.read().split(b"\0")
                        if item.startswith(b"DBUS_SESSION_BUS_ADDRESS=")), None)
        if bus:
            os.environ["DBUS_SESSION_BUS_ADDRESS"] = os.fsdecode(bus)
            break
    except OSError:
        continue
else:
    sys.exit(0)

api = c.CDLL("libatspi.so.0")
glib = c.CDLL("libglib-2.0.so.0")
gobject = c.CDLL("libgobject-2.0.so.0")
ptr, integer = c.c_void_p, c.c_int


def bind(library, name, result, *args):
    function = getattr(library, name)
    function.restype = result
    function.argtypes = args
    return function


class Rect(c.Structure):
    _fields_ = [(key, integer) for key in ("x", "y", "width", "height")]


init = bind(api, "atspi_init", integer)
timeout = bind(api, "atspi_set_timeout", None, integer, integer)
desktop = bind(api, "atspi_get_desktop", ptr, integer)
count = bind(api, "atspi_accessible_get_child_count", integer, ptr, ptr)
child = bind(api, "atspi_accessible_get_child_at_index", ptr, ptr, integer, ptr)
component = bind(api, "atspi_accessible_get_component_iface", ptr, ptr)
at_point = bind(api, "atspi_component_get_accessible_at_point", ptr, ptr, integer, integer, integer, ptr)
extents = bind(api, "atspi_component_get_extents", c.POINTER(Rect), ptr, integer, ptr)
name = bind(api, "atspi_accessible_get_name", ptr, ptr, ptr)
role = bind(api, "atspi_accessible_get_role_name", ptr, ptr, ptr)
free = bind(glib, "g_free", None, ptr)
unref = bind(gobject, "g_object_unref", None, ptr)


def label(get, item):
    value = get(item, None)
    if not value:
        return ""
    try:
        return c.string_at(value).decode("utf-8", errors="replace")[:180]
    finally:
        free(value)


def inspect(item, app_name, depth=0):
    if not item or depth > 10:
        return
    iface = component(item)
    if not iface:
        return
    try:
        frame = extents(iface, 0, None)
        if not frame:
            return
        try:
            r = frame.contents
            if not (r.x <= x < r.x + r.width and r.y <= y < r.y + r.height):
                return
            bounds = {k: getattr(r, k) for k, _ in Rect._fields_}
        finally:
            free(frame)
        hit = at_point(iface, x, y, 0, None)
        if hit:
            try:
                if hit != item:
                    result = inspect(hit, app_name, depth + 1)
                    if result:
                        return result
            finally:
                unref(hit)
        kind = label(role, item)
        return {"application": app_name, "role": kind,
                "name": "" if "password" in kind.lower() else label(name, item), "frame": bounds}
    finally:
        unref(iface)


if init() != 0:
    sys.exit(0)
timeout(300, 800)
root = desktop(0)
candidates = []
if root:
    for i in range(min(24, max(0, count(root, None)))):
        app = child(root, i, None)
        if not app:
            continue
        try:
            app_name = label(name, app)
            for j in range(min(20, max(0, count(app, None)))):
                window = child(app, j, None)
                if window:
                    try:
                        match = inspect(window, app_name)
                        if match:
                            candidates.append(match)
                    finally:
                        unref(window)
        finally:
            unref(app)
if candidates:
    print(json.dumps(min(candidates, key=lambda hit: hit["frame"]["width"] * hit["frame"]["height"])))
