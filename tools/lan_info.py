# -*- coding: utf-8 -*-
"""打印本机在局域网里的 IPv4 地址(给「局域网聚会模式」用:同一 WiFi 的设备用这个地址打开网页)。
思路:向一个不会真正发包的 UDP 地址“拨号”,让系统按默认路由选出一张网卡,取其 IPv4;
选不到时退回主机名解析;再不行返回 127.0.0.1。"""

import socket


def lan_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("10.255.255.255", 1))
        ip = s.getsockname()[0]
    except Exception:
        ip = ""
    finally:
        try:
            s.close()
        except Exception:
            pass
    if ip and not ip.startswith("127."):
        return ip
    try:
        for ip2 in socket.gethostbyname_ex(socket.gethostname())[2]:
            if not ip2.startswith("127."):
                return ip2
    except Exception:
        pass
    return "127.0.0.1"


if __name__ == "__main__":
    print(lan_ip())
