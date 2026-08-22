import os
import sys
import tarfile
import io
import time
import shutil

def create_ar_header(name, size, mode=0o100644, mtime=None):
    if mtime is None:
        mtime = int(time.time())
    # Format according to GNU/Debian ar standard:
    # 0-15: filename (16 chars, terminated by / and space padded)
    # 16-27: mtime (12 chars)
    # 28-33: uid (6 chars)
    # 34-39: gid (6 chars)
    # 40-47: mode (8 chars octal)
    # 48-57: size (10 chars)
    # 58-59: trailer (`\n)
    name_field = (name.strip() + "/").ljust(16)[:16]
    mtime_field = str(mtime).ljust(12)[:12]
    uid_field = "0".ljust(6)[:6]
    gid_field = "0".ljust(6)[:6]
    mode_field = oct(mode)[2:].ljust(8)[:8]
    size_field = str(size).ljust(10)[:10]
    trailer = "`\n"
    header = (name_field + mtime_field + uid_field + gid_field + mode_field + size_field + trailer).encode('ascii')
    assert len(header) == 60, f"Header length must be 60, got {len(header)}"
    return header

def build_deb():
    root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    linux_unpacked = os.path.join(root_dir, "output", "linux-unpacked")
    output_dir = os.path.join(root_dir, "output")
    deb_file = os.path.join(output_dir, "gSender-1.6.3-amd64.deb")

    if not os.path.exists(linux_unpacked):
        print(f"Error: {linux_unpacked} does not exist. Run electron-builder for linux first.")
        sys.exit(1)

    print("Step 1: Calculating installed size...")
    installed_size_bytes = 0
    for dirpath, dirnames, filenames in os.walk(linux_unpacked):
        for f in filenames:
            fp = os.path.join(dirpath, f)
            installed_size_bytes += os.path.getsize(fp)
    installed_size_kb = int(installed_size_bytes / 1024)

    # 1. debian-binary
    debian_binary_bytes = b"2.0\n"

    # 2. control.tar.gz
    print("Step 2: Building control.tar.gz...")
    control_content = f"""Package: gsender
Version: 1.6.3
Section: utils
Priority: optional
Architecture: amd64
Maintainer: Sienci Labs <hi@sienci.com>
Installed-Size: {installed_size_kb}
Depends: gconf2, gconf-service, libgtk-3-0, libnotify4, libnss3, libxss1, libxtst6, xdg-utils, libasound2, libgl1
Description: Electron sender for GRBL based CNC machines
 gSender is a lightweight CNC G-code sender designed for GRBL-based CNC machines.
"""
    # postinst script for desktop database update and permissions
    postinst_content = """#!/bin/sh
set -e
if [ "$1" = "configure" ]; then
    chmod 4755 /opt/gSender/chrome-sandbox 2>/dev/null || true
    chmod +x /opt/gSender/gsender || true
    if command -v update-desktop-database >/dev/null 2>&1; then
        update-desktop-database -q || true
    fi
fi
exit 0
"""
    # postrm script
    postrm_content = """#!/bin/sh
set -e
if [ "$1" = "remove" ] || [ "$1" = "purge" ]; then
    if command -v update-desktop-database >/dev/null 2>&1; then
        update-desktop-database -q || true
    fi
fi
exit 0
"""

    control_buf = io.BytesIO()
    with tarfile.open(fileobj=control_buf, mode="w:gz") as tar:
        # ./
        ti = tarfile.TarInfo(name="./")
        ti.type = tarfile.DIRTYPE
        ti.mode = 0o755
        tar.addfile(ti)

        # ./control
        cb = control_content.encode('utf-8')
        ti = tarfile.TarInfo(name="./control")
        ti.size = len(cb)
        ti.mode = 0o644
        tar.addfile(ti, io.BytesIO(cb))

        # ./postinst
        pb = postinst_content.encode('utf-8')
        ti = tarfile.TarInfo(name="./postinst")
        ti.size = len(pb)
        ti.mode = 0o755
        tar.addfile(ti, io.BytesIO(pb))

        # ./postrm
        prmb = postrm_content.encode('utf-8')
        ti = tarfile.TarInfo(name="./postrm")
        ti.size = len(prmb)
        ti.mode = 0o755
        tar.addfile(ti, io.BytesIO(prmb))

    control_tar_gz_bytes = control_buf.getvalue()

    # 3. data.tar.gz
    print("Step 3: Building data.tar.gz...")
    data_buf = io.BytesIO()
    with tarfile.open(fileobj=data_buf, mode="w:gz") as tar:
        # Directories
        for d in ["./", "./opt", "./opt/gSender", "./usr", "./usr/bin", "./usr/share", "./usr/share/applications", "./usr/share/icons", "./usr/share/icons/hicolor", "./usr/share/icons/hicolor/512x512", "./usr/share/icons/hicolor/512x512/apps"]:
            ti = tarfile.TarInfo(name=d)
            ti.type = tarfile.DIRTYPE
            ti.mode = 0o755
            tar.addfile(ti)

        # Files in /opt/gSender
        for dirpath, dirnames, filenames in os.walk(linux_unpacked):
            rel_dir = os.path.relpath(dirpath, linux_unpacked)
            if rel_dir != ".":
                target_dir = "./opt/gSender/" + rel_dir.replace("\\", "/")
                ti = tarfile.TarInfo(name=target_dir)
                ti.type = tarfile.DIRTYPE
                ti.mode = 0o755
                tar.addfile(ti)

            for f in filenames:
                fp = os.path.join(dirpath, f)
                rel_file = os.path.relpath(fp, linux_unpacked).replace("\\", "/")
                target_path = "./opt/gSender/" + rel_file
                size = os.path.getsize(fp)
                
                ti = tarfile.TarInfo(name=target_path)
                ti.size = size
                if f in ["gsender", "chrome-sandbox", "chrome_crashpad_handler"]:
                    ti.mode = 0o755
                else:
                    ti.mode = 0o644

                with open(fp, "rb") as fh:
                    tar.addfile(ti, fh)

        # Symlink /usr/bin/gsender -> /opt/gSender/gsender
        ti = tarfile.TarInfo(name="./usr/bin/gsender")
        ti.type = tarfile.SYMTYPE
        ti.linkname = "/opt/gSender/gsender"
        tar.addfile(ti)

        # .desktop file
        desktop_entry = """[Desktop Entry]
Name=gSender
Comment=Electron sender for GRBL based CNC machines
Exec=/opt/gSender/gsender %U
Terminal=false
Type=Application
Icon=gsender
StartupWMClass=gSender
Categories=Utility;
"""
        db = desktop_entry.encode('utf-8')
        ti = tarfile.TarInfo(name="./usr/share/applications/gsender.desktop")
        ti.size = len(db)
        ti.mode = 0o644
        tar.addfile(ti, io.BytesIO(db))

        # Icon
        icon_path = os.path.join(root_dir, "electron-build", "icon-round.png")
        if os.path.exists(icon_path):
            with open(icon_path, "rb") as fh:
                icon_bytes = fh.read()
            ti = tarfile.TarInfo(name="./usr/share/icons/hicolor/512x512/apps/gsender.png")
            ti.size = len(icon_bytes)
            ti.mode = 0o644
            tar.addfile(ti, io.BytesIO(icon_bytes))

    data_tar_gz_bytes = data_buf.getvalue()

    # 4. Write .deb file (Unix ar archive)
    print(f"Step 4: Writing {deb_file}...")
    with open(deb_file, "wb") as deb:
        # AR magic
        deb.write(b"!<arch>\n")

        # debian-binary member
        deb.write(create_ar_header("debian-binary", len(debian_binary_bytes)))
        deb.write(debian_binary_bytes)
        if len(debian_binary_bytes) % 2 != 0:
            deb.write(b"\n")

        # control.tar.gz member
        deb.write(create_ar_header("control.tar.gz", len(control_tar_gz_bytes)))
        deb.write(control_tar_gz_bytes)
        if len(control_tar_gz_bytes) % 2 != 0:
            deb.write(b"\n")

        # data.tar.gz member
        deb.write(create_ar_header("data.tar.gz", len(data_tar_gz_bytes)))
        deb.write(data_tar_gz_bytes)
        if len(data_tar_gz_bytes) % 2 != 0:
            deb.write(b"\n")

    deb_size_mb = os.path.getsize(deb_file) / (1024 * 1024)
    print(f"SUCCESS: Built {deb_file} ({deb_size_mb:.2f} MB)")

if __name__ == "__main__":
    build_deb()
