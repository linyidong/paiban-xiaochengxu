# -*- coding: utf-8 -*-
# 参数分发脚本：读取《人工必填参数清单.json》-> 写入 miniprogram/config.js + 各云函数 config.json
# 用法：双击《同步参数.bat》或命令行运行 python sync-config.py
import json, os
root = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(root, "人工必填参数清单.json"), "r", encoding="utf-8") as f:
    data = json.load(f)

fe = data["前端参数"]
cf = data["云函数参数"]
payload = {
    "env": fe["云环境ID"],
    "SHIFT_TYPES": fe["班次列表"],
    "SHIFT_COLOR": fe["班次颜色"],
    "BASIC_SHIFTS": fe["4状态班次"],
    "SPECIAL_SHIFTS": fe["6状态班次"],
    "MEMBER_ALIAS": cf["成员别名映射"],
    "STYLE": {
        "bg": fe["界面样式"]["背景色"],
        "cardBg": fe["界面样式"]["卡片色"],
        "primary": fe["界面样式"]["主色"],
        "radiusCard": fe["界面样式"]["卡片圆角"],
        "radiusBtn": fe["界面样式"]["按钮圆角"]
    }
}
head = "// ⚠️ 本文件由《同步参数.bat》自动生成，请勿手改！\n// 改参数请编辑项目根目录《人工必填参数清单.json》后运行同步脚本。\n"
cfg_js = head + "module.exports = " + json.dumps(payload, ensure_ascii=False, indent=2) + ";\n"
with open(os.path.join(root, "miniprogram", "config.js"), "w", encoding="utf-8") as f:
    f.write(cfg_js)
print("OK miniprogram/config.js")

admin_cfg = json.dumps({"ADMIN_OPENIDS": cf["管理员openid白名单"]}, ensure_ascii=False, indent=2)
for fn in ["login", "updateShift", "manageMember"]:
    d = os.path.join(root, "cloudfunctions", fn)
    os.makedirs(d, exist_ok=True)
    with open(os.path.join(d, "config.json"), "w", encoding="utf-8") as f:
        f.write(admin_cfg)
    print("OK cloudfunctions/" + fn + "/config.json")

vision_cfg = json.dumps({"AI_VISION_API_KEY": cf["AI识别API_KEY"], "AI_VISION_ENDPOINT": cf["AI识别端点"], "AI_VISION_MODEL": cf["AI识别模型"], "MEMBER_ALIAS": cf["成员别名映射"], "ADMIN_OPENIDS": cf["管理员openid白名单"], "AI_VISION_FALLBACK_MODEL": cf["AI识别备用模型"]}, ensure_ascii=False, indent=2)
with open(os.path.join(root, "cloudfunctions", "importShift", "config.json"), "w", encoding="utf-8") as f:
    f.write(vision_cfg)
print("OK cloudfunctions/importShift/config.json")

settings_cfg = json.dumps({"ADMIN_OPENIDS": cf["管理员openid白名单"], "AI_VISION_API_KEY": cf["AI识别API_KEY"], "AI_VISION_MODEL": cf["AI识别模型"], "AI_VISION_FALLBACK_MODEL": cf["AI识别备用模型"], "AI_VISION_ENDPOINT": cf["AI识别端点"]}, ensure_ascii=False, indent=2)
d = os.path.join(root, "cloudfunctions", "manageSettings")
os.makedirs(d, exist_ok=True)
with open(os.path.join(d, "config.json"), "w", encoding="utf-8") as f:
    f.write(settings_cfg)
print("OK cloudfunctions/manageSettings/config.json")

stats_cfg = json.dumps({"ADMIN_OPENIDS": cf["管理员openid白名单"]}, ensure_ascii=False, indent=2)
d = os.path.join(root, "cloudfunctions", "getStats")
os.makedirs(d, exist_ok=True)
with open(os.path.join(d, "config.json"), "w", encoding="utf-8") as f:
    f.write(stats_cfg)
print("OK cloudfunctions/getStats/config.json")
print("分发完成：改参数后双击《同步参数.bat》，再重新部署云函数即可生效")
