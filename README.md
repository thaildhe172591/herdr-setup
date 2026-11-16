# herdr-setup

Bộ tùy biến [Herdr](https://herdr.dev) cho Windows: layout **desktop** trông và dùng như Claude Desktop (sidebar, khung chat dưới cùng, Tệp/Thay đổi/Diff mở thành tab), cùng **Phòng ban**: một nhóm agent (Claude Code, Codex, Antigravity) làm chung một dự án qua Bảng việc.

Repo chỉ chứa cấu hình và mod. Herdr App và herdr-core vẫn cài từ herdr.dev.

## Yêu cầu

| Cần | Ghi chú |
|---|---|
| Windows 10/11 | |
| [Herdr App](https://herdr.dev) (kèm herdr-core `hc`) | Đã thử với herdr-app 0.1.15, hc 0.1.20 |
| PowerShell 7 | `install.ps1` tự cài bằng winget nếu thiếu |
| Git for Windows | Terminal trong Herdr chạy bằng Git Bash |
| Node.js LTS | Thanh trạng thái Claude Code và test của mod |
| Claude Code | Agent chính của khung chat và Phòng ban |
| Codex, Antigravity (`agy`) | Tùy chọn, cho vai Review và QA trong Phòng ban |
| Font [Maple Mono NF](https://github.com/subframe7536/maple-font/releases) | Tùy chọn; không có thì đổi `"font"` trong `settings.json` |

## Cài

```powershell
git clone https://github.com/thaildhe172591/herdr-setup.git
cd herdr-setup
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

`-ExecutionPolicy Bypass` chỉ áp cho lần chạy này, không đổi chính sách của máy. Các tùy chọn bên dưới thêm vào cuối lệnh trên.

`install.ps1` làm lần lượt:

1. Kiểm Herdr App, `hc`, Git, Node; thiếu Git hoặc Node thì hỏi để cài bằng winget, thiếu Herdr thì mở herdr.dev.
2. Chép `herdr-app\` vào `~\.config\herdr-app`, mẫu agent vào `%APPDATA%\herdr-core\templates`, lệnh `ha` và `herdr-shutdown` vào `~\.local\bin` (thêm vào PATH). File cũ khác bản mới được sao lưu ở `~\.herdr-setup-backup\<giờ>`.
3. Hỏi thư mục chứa các dự án (ghi vào `~\.config\herdr-app\projects.json`), đặt shell của herdr-core là Git Bash nếu herdr-core chưa có cấu hình.
4. Hỏi để bật thanh trạng thái Claude Code cho Herdr (context, model, chi phí hiện trên rail và khung chat). Đã có `statusLine` khác thì không đè, chỉ in lệnh để tự sửa.
5. Nếu máy có Codex hoặc Antigravity: thêm hook báo phiên đang mở (`~.codexhooks.json` kèm `[features] hooks = true`, `~.geminiconfighooks.json`), để sau khi khởi động lại máy mỗi pane mở lại đúng phiên cũ.

Xong thì **tắt hẳn Herdr App rồi mở lại**, chọn layout **desktop** nếu chưa phải layout đang dùng.

| Tùy chọn | Tác dụng |
|---|---|
| `.\install.ps1 -Yes` | Không hỏi: bỏ trống thư mục dự án, bật thanh trạng thái |
| `.\install.ps1 -Roots 'D:\Work','E:\Repos'` | Khai luôn thư mục dự án |
| `.\install.ps1 -NoStatusLine` | Không đụng `~\.claude\settings.json` |
| `.\install.ps1 -DryRun` | Chỉ in ra sẽ làm gì |
| `.\install.ps1 -TargetHome D:\thu\home` | Thử cài vào một thư mục giả |

Cập nhật: `git pull` rồi chạy lại `.\install.ps1` (file không đổi được giữ nguyên, `projects.json` và cấu hình herdr-core đã có không bị đè).

Gỡ: chép lại file trong `~\.herdr-setup-backup\<giờ>`, hoặc xoá các mod trong `~\.config\herdr-app\mods` rồi mở lại Herdr App (Herdr dựng lại layout gốc của nó).

## Có gì

| Mod | Làm gì |
|---|---|
| `composer` | Khung chat dưới các pane, gửi tin cho agent đang chọn; sau khi khởi động lại máy tự mở lại đúng phiên cũ trong từng pane (Claude Code, Codex, Antigravity) |
| `desktop-chrome`, `desktop-quick`, `desktop-spaces` | Sidebar: thao tác nhanh, danh sách space theo dự án, worktree nằm dưới repo gốc |
| `desktop-agents` | Danh sách agent theo nhóm hoặc theo độ ưu tiên |
| `desktop-tabs`, `desktop-pane`, `desktop-menu` | Thanh tab, đầu pane (tách, phóng to, đóng), menu chuột phải |
| `desktop-rail` | Thẻ phiên (Ctrl+Shift+R): context, file đã sửa, việc của phiên |
| `desktop-status` | Thanh trạng thái: máy, nhánh, model, context của Claude trong tab |
| `desktop-files`, `desktop-viewer` | Cây thư mục kiểu VS Code (icon theo loại file, đánh dấu git); bấm file là mở pane xem bên cạnh |
| `desktop-changes`, `desktop-diff` | Thay đổi chưa commit và Diff của space |
| `new-session` | Phiên mới (Ctrl+Shift+N): chọn thư mục, agent, model |
| `projects` | Mở dự án (Ctrl+Shift+J) từ các thư mục trong `projects.json` |
| `needs-you` | Hộp **Cần bạn** (Ctrl+Shift+Space): trả lời agent đang hỏi mà không phải tìm pane |
| `hotkeys` | Bảng phím tắt (F1) |
| `team` | **Phòng ban**: Điều phối (Claude) nói chuyện với bạn, chia việc cho DEV, QA, Review qua Bảng việc |

Kèm theo: theme `catppuccin-mocha`, `atom-one-dark`, `win98`; `keys.json` (phím tắt); `bridge\` (thanh trạng thái Claude Code → Herdr); lệnh `ha <dự án>` mở Herdr App đúng dự án; `herdr-shutdown` tắt máy mà không mất phiên (đỗ terminal của herdr-core trước khi Windows tắt).

Hướng dẫn dùng đầy đủ (tiếng Việt): [`herdr-app/docs/HUONG-DAN-SU-DUNG.md`](herdr-app/docs/HUONG-DAN-SU-DUNG.md). Giao diện có tiếng Việt và tiếng Anh (đổi ở góc dưới sidebar).

## Phát triển mod

```powershell
cd herdr-app
node --test tests/*.test.mjs                      # logic thuần của các mod
herdr-app check $env:USERPROFILE\.config\herdr-app\mods\team   # nạp một mod đã cài và báo lỗi
```

Phần logic không phụ thuộc Herdr nằm trong `model.js`, `look.js`, `list.js`… để test bằng `node --test`; `main.js` vẽ giao diện bằng `gpui-kit`.

## Giấy phép

Apache-2.0 (xem [`LICENSE`](LICENSE) và [`NOTICE`](NOTICE)). Một số mod `desktop-*` là bản sửa từ mod đi kèm Herdr App, vốn theo Apache-2.0.
