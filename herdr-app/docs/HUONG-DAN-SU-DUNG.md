# Hướng dẫn sử dụng Herdr App (bản tùy biến)

Bản tùy biến ngày 2026-11-10 (layout `desktop`) · cập nhật 2026-11-10

Herdr App bản này trông và dùng giống Claude Desktop: sidebar bên trái, khung chat ở dưới, Tệp/Thay đổi/Diff mở thành tab. Thêm vào đó là **phòng ban AI**: một nhóm agent (Điều phối, DEV, QA, Review) làm việc theo phiếu, có bảng việc để bạn giao, theo dõi và duyệt.

Tài liệu này viết theo mã đang chạy trong `~\.config\herdr-app\mods`. Nhãn nút được chép đúng như trên màn hình tiếng Việt. Khi bạn chuyển giao diện sang tiếng Anh (mục 9), nhãn tiếng Anh ghi sau dấu `/`.

## Mục lục

1. [Bắt đầu nhanh](#1-bắt-đầu-nhanh)
2. [Mở app bằng lệnh `ha`](#2-mở-app-bằng-lệnh-ha)
3. [Màn hình chính](#3-màn-hình-chính)
4. [Làm việc với một agent](#4-làm-việc-với-một-agent)
5. [Phòng ban AI](#5-phòng-ban-ai)
6. [Bảng việc](#6-bảng-việc)
7. [Làn, nhịp và cỡ việc: cơ chế chi tiết](#7-làn-nhịp-và-cỡ-việc-cơ-chế-chi-tiết)
8. [Cách dùng hiệu quả nhất](#8-cách-dùng-hiệu-quả-nhất)
9. [Ngôn ngữ và cài đặt](#9-ngôn-ngữ-và-cài-đặt)
10. [Phím tắt](#10-phím-tắt)
11. [An toàn](#11-an-toàn)
12. [Xử lý sự cố](#12-xử-lý-sự-cố)
13. [Phụ lục: file và thư mục](#13-phụ-lục-file-và-thư-mục)

## 1. Bắt đầu nhanh

Năm bước để vào việc:

1. Mở PowerShell hoặc Git Bash, gõ `ha <tên dự án>` (ví dụ `ha shop`). App mở, chuyển tới space của dự án, có sẵn một phiên Claude.
2. Gõ yêu cầu vào khung chat ở dưới, nhấn **Enter**.
3. Agent hỏi gì thì nhấn **Ctrl+Shift+Space** (hộp **Cần bạn**) và chọn bằng phím số.
4. Xem code đã đổi ở tab **Diff** (góc trên bên phải).
5. Việc lớn hoặc nhiều việc: nhấn **Ctrl+Shift+D** để tạo phòng ban (mục 5), rồi giao việc trên **Bảng việc**.

Quên phím: nhấn **F1**.

## 2. Mở app bằng lệnh `ha`

`ha` mở Herdr App ở một dự án, chạy được từ PowerShell, cmd và Git Bash.

| Lệnh | Kết quả |
|---|---|
| `ha` | Mở thư mục hiện tại |
| `ha acme` | Mở dự án theo tên, lấy từ danh sách **Mở dự án** |
| `ha Approval` | Tên một phần cũng được; khớp nhiều dự án thì in danh sách |
| `ha D:\path\to\repo` | Mở theo đường dẫn |
| `ha acme -Task "sửa lỗi X"` | Claude bắt đầu với task này (space đã có thì thêm tab mới) |
| `ha acme -Shell` | Space chỉ có shell, không chạy agent |
| `ha acme -Agent codex` | Chạy Codex thay Claude |
| `ha -All` | Bỏ phạm vi: sidebar hiện mọi space |
| `ha -Help` | Xem hướng dẫn của lệnh |

Cách `ha` chọn space:

1. Đã có space của đúng thư mục: chuyển tới.
2. Không có: chuyển tới space đầu tiên nằm trong thư mục đó.
3. Vẫn không có: tạo space mới chạy Claude.

App chưa mở thì `ha` mở qua Explorer, để app chạy trong môi trường sạch.

Sau `ha <dự án>`, sidebar chỉ hiện các space trong thư mục đó và các repo con. Chip phạm vi trên đầu danh sách **Không gian** ghi tên thư mục; bấm **×** để hiện lại tất cả.

## 3. Màn hình chính

| Vùng | Vị trí | Chứa gì |
|---|---|---|
| Sidebar | Trái, rộng 268 px | Logo, tìm kiếm, lối tắt, danh sách **Không gian** và **Agent**, Cài đặt, Thêm máy, Ngôn ngữ |
| Thanh tab | Trên cùng | Các tab của space đang chọn, nút **+**, **Tệp**, **Thay đổi**, **Diff**, nút cửa sổ |
| Vùng làm việc | Giữa | Các pane terminal/agent của tab đang chọn, mỗi pane một thẻ có đầu pane |
| Rail phiên | Phải, rộng 340 px | Môi trường, Git, Agent, Ngữ cảnh, Kết nối, Kỹ năng, Plugin, Đầu ra. Bật/tắt: **Ctrl+Shift+R** |
| Khung chat | Dưới cùng | Ô nhập tin cho agent và dải chip trạng thái |

### 3.1 Sidebar

**Đầu sidebar**: logo Herdr, nút kính lúp (tìm tab hoặc agent, như **Ctrl+Shift+K**) và nút thu sidebar thành dải icon. Kéo sidebar hẹp dưới 160 px cũng thành dải icon. **Ctrl+Shift+B** ẩn/hiện cả sidebar.

**Bốn lối tắt**:

| Dòng | Phím | Mở |
|---|---|---|
| Phiên mới | Ctrl+Shift+N | Hộp tạo phiên agent mới (mục 4.1) |
| Mở dự án | Ctrl+Shift+J | Danh sách dự án (mục 4.2) |
| Cần bạn | Ctrl+Shift+Space | Hộp trả lời agent (mục 4.5). Huy hiệu đỏ nhấp nháy = có agent đang hỏi; huy hiệu màu khác = số agent vừa xong |
| Phòng ban | Ctrl+Shift+D | Danh sách và tạo phòng ban (mục 5). Huy hiệu = số thành viên đang chạy của space hiện tại |

**Không gian** (danh sách space):

- Mỗi space một dòng: ô chữ cái màu, tên, và phần git chỉ khi khác thường.
  - Phần git gồm repo, nhánh (ẩn nếu là main/master), ↑N commit chưa push (xanh lá), ↓N commit chưa kéo về (đỏ).
- Worktree nằm thụt vào dưới repo gốc, có biểu tượng nhánh.
- Huy hiệu người kèm số: space có phòng ban.
  - Màu xanh: còn thành viên đang chạy.
  - Màu xám: phòng ban đã dừng.
  - Bấm huy hiệu để mở Bảng việc.
- Bấm để chọn space. Kéo thả để đổi thứ tự trong cùng một máy.
- Chuột phải mở menu: **Đổi tên** · **Worktree mới** · **Mở worktree** · **Gỡ worktree** (chỉ với worktree) · **Đóng**.
- Nút **+** cạnh tiêu đề: **Space mới… (chọn thư mục)**, mở hộp Phiên mới.
- Nút chồng lớp: **Nhóm, sắp xếp, lọc**.
  - **Nhóm theo**: Dự án, Trạng thái, Máy, Không nhóm.
  - **Sắp xếp**: Thứ tự của tôi, Tên, Cần bạn trước.
  - **Hiện**: Tất cả space, hoặc Chỉ space có agent.
- Khi nhóm theo Dự án, đầu nhóm có chấm đỏ nếu một space trong nhóm đang cần bạn, và nút **+** để mở dự án trong nhóm đó.

**Agent** (danh sách agent):

- Nhóm mặc định theo trạng thái: **Đã ghim**, **Cần bạn**, **Xong**, **Đang làm**, **Rảnh**.
- Mỗi dòng: biểu tượng chương trình, tên, thời gian kể từ lần hoạt động cuối.
  - Thành viên phòng ban hiện tên vai (Điều phối, DEV, QA, Review…).
  - Trạng thái: vòng quay (đang làm), nhãn đỏ **Cần bạn**, vòng tròn (rảnh), chấm (xong).
- Bấm để chuyển tới pane của agent. **Alt+↑ / Alt+↓** đi theo thứ tự danh sách.
- Phiên con nằm dưới phiên cha theo cây. Bấm phiên con không có pane để xem nhanh (peek).
- Rê chuột vào dòng: nút ghim và **⋯**. Chuột phải hoặc **⋯** mở menu agent (bảng dưới).
- Nút sắp xếp ở tiêu đề:
  - **Nhóm theo**: Trạng thái, Space, Dự án, Dự án › Space, Không nhóm.
  - **Sắp xếp trong nhóm**: Ưu tiên (cần bạn trước), Mới hoạt động, Tên, Thứ tự space.
  - **Ẩn phiên con**.

Menu agent (gõ chữ cái để chọn nhanh):

| Mục | Phím | Việc |
|---|---|---|
| Gửi tin cho agent này | M | Đặt agent làm nơi nhận của khung chat |
| Tạo phiên con… | N | Khung chat vào chế độ phiên con dưới agent này |
| Chèn câu trả lời vào khung chat | C | Lấy câu trả lời mới nhất của agent vào khung chat |
| Xem nhanh | V | Xem màn hình agent trong cửa sổ nổi |
| Chuyển tới tab của agent | G | Mở tab chứa agent |
| Mở thành pane bên phải / Mở thành tab riêng | O / T | Cho phiên con một pane hoặc một tab |
| Fork phiên (tab mới) | F | Chỉ với Claude: mở tab mới chạy `claude --resume … --fork-session`, tách một nhánh hội thoại |
| Ghim lên đầu / Bỏ ghim | P | Ghim agent lên đầu mọi danh sách |
| Đổi tên tab… | R | Đổi tên tab của agent |
| Ẩn / hiện phiên con | H | Gập các phiên con |
| Dừng agent… | D | Bấm hai lần ("Bấm lần nữa để dừng hẳn") để tắt agent |

**Chân sidebar**: **Cài đặt** (Ctrl+,; có chấm khi có bản cập nhật), **Thêm máy** (thêm máy SSH), **Ngôn ngữ** với nút **VI | EN** (mục 9).

### 3.2 Thanh tab và đầu pane

Thanh tab:

- Tab có biểu tượng chương trình, tên, vòng quay khi agent đang làm, chấm khi agent cần bạn hoặc vừa xong.
- Bấm để chọn tab. Bấm đúp hoặc **F2** để đổi tên. Kéo thả để đổi thứ tự. Lăn chuột trên thanh tab để chuyển tab. Chuột phải: **Đổi tên** · **Tab mới** · **Đóng**.
- **+**: menu tạo tab mới (terminal hoặc agent đã cài).
- **Tệp**, **Thay đổi**, **Diff**: mở thành tab của space (mục 4.6). Bấm lại khi tab đã có thì chỉ chuyển tới.

Đầu pane (thanh mỏng trên mỗi pane):

- Biểu tượng chương trình, nhãn vai màu (nếu là thành viên phòng ban), tên, thư mục.
- Nhãn đỏ **Cần bạn** khi agent đang chờ bạn.
- Rê chuột hiện nút: **Tách phải**, **Tách xuống** (mở thêm agent cùng loại), phóng to, đóng.

Chuột phải trong terminal: **Tách phải**, **Tách xuống**, **Tách phải · Terminal** (shell thường cạnh agent), **Phóng to**, **Gửi chuột phải vào pane** / **Dùng menu chuột phải của Herdr**, **Đóng pane**. Phiên con đã mở pane có thêm **Trả về <phiên cha>**.

## 4. Làm việc với một agent

### 4.1 Phiên mới

Mục tiêu: mở một agent ở một thư mục, có thể kèm yêu cầu đầu tiên.

1. Nhấn **Ctrl+Shift+N**, hoặc bấm **Phiên mới**.
2. **Môi trường**: **Máy này**, hoặc một máy SSH đã thêm.
3. **Thư mục**: gõ để lọc. Danh sách gồm **Đã chọn**, **Gần đây** (tối đa 8), **Dự án**. Dòng cuối **Mở thư mục…** mở hộp chọn thư mục của Windows. Với máy khác, gõ đường dẫn trên máy đó.
4. **Agent**: chọn một agent đã cài (Claude Code, Codex, Antigravity…) hoặc **Terminal**.
5. **Yêu cầu đầu tiên** (tuỳ chọn): gõ việc cần làm.
6. Nhấn **Enter** hoặc bấm **Bắt đầu ↵**.

Kết quả: một space mới với một tab chạy agent. Tên tab là bốn chữ đầu của yêu cầu, hoặc tên agent.

Lưu thư mục thành dự án: bấm **Lưu thành dự án…**, điền **Tên dự án**, **Lệnh dev**, **Lệnh check** (để trống = tự đoán), bấm **Lưu**. Dự án được ghi vào `projects.json` và hiện trong **Mở dự án** với dấu ★.

Khi gặp lỗi: "projects.json bị lỗi cú pháp" → sửa file rồi lưu lại.

### 4.2 Mở dự án

Mục tiêu: chuyển nhanh tới một repo trong các thư mục gốc.

1. Nhấn **Ctrl+Shift+J**, hoặc bấm **Mở dự án**.
2. Gõ để lọc (tên, đường dẫn, nhánh, stack; ví dụ `claim`, `core`).
3. Chọn bằng **↑/↓**, nhấn **Enter**.

Kết quả: space của dự án đã mở thì chuyển tới; chưa có thì mở space mới chạy Claude (hoặc agent đã lưu cho dự án).

- **Ctrl+Enter**: mở kèm tab **run** chạy lệnh dev, và lệnh check ở pane bên phải.
- Ký hiệu đầu dòng: ● đã có space đang mở, ⑂ worktree, ↺ gần đây. **±** đỏ: repo có thay đổi chưa commit.
- Nhóm **Gần đây** là các thư mục bạn đã làm với Claude.
- Nhóm **Khác**: **Duyệt thư mục khác…** và **Thêm thư mục gốc vào danh sách…**.
- Thư mục gốc: mục `roots` trong `~\.config\herdr-app\projects.json` (`install.ps1` hỏi lúc cài; sửa tay rồi mở lại danh sách là có).

Khi gặp lỗi: "Không quét được: …" → kiểm tra `projects.json` và quyền đọc thư mục.

### 4.3 Khung chat

Khung chat ở dưới cùng gửi tin cho agent mà không cần bấm vào terminal.

**Gửi tin**:

1. Nhấn **Ctrl+Shift+I** để vào ô nhập (hoặc bấm vào ô).
2. Gõ tin. **Shift+Enter** xuống dòng; ô nở tới 6 dòng.
3. Nhấn **Enter** hoặc bấm nút mũi tên tròn.

Kết quả: "Đã gửi tới <space · tab>". Ô nhập trống ngay; gửi lỗi thì chữ được trả lại.

**Chọn nơi nhận**: chip cạnh nút **+** ghi "<space> › <agent>".

- Mặc định **Tự động**: agent của pane đang trỏ, bất kể là Claude, Codex hay Antigravity. Trỏ vào terminal thường thì gửi cho Claude của tab đó, rồi tới Claude của space.
- Bấm chip để chọn tay. Tick nhiều agent ở nhiều space để gửi một tin cho tất cả. Chọn **Tự động** để bỏ chọn tay.
- Agent đang chờ bạn trả lời sẽ không nhận tin (tin đó sẽ thành câu trả lời). Khung chat báo: "<nơi> đang chờ bạn trả lời …" kèm nút **Mở Cần bạn**.

**Nhắn một thành viên phòng ban**: bắt đầu bằng `@vai` (mục 5.5).

**Đính kèm** (nút **+**, "Đính kèm"):

| Mục | Phím | Việc |
|---|---|---|
| Thêm file hoặc ảnh… | | Chọn file; file được chèn dạng `@đường-dẫn` |
| Thêm thư mục… | | Chọn thư mục |
| Dán ảnh từ clipboard | Alt+V | Lưu ảnh vào `attachments` và đính kèm |
| Chèn câu trả lời của agent… | | Lấy câu trả lời mới nhất của agent A để gửi cho agent B |
| Gửi thành phiên con | Ctrl+Enter | Agent mới làm task này, báo về agent đang chọn |
| Tạo phòng ban… | | Mở hộp phòng ban |
| Phím tắt | F1 | Bảng phím tắt |

Cũng có thể kéo thả file vào khung chat, hoặc dán ảnh bằng Ctrl+V. Ảnh hiện thành ô nhỏ: bấm để xem lớn, bấm × để bỏ.

**Chuyển kết quả giữa hai agent**:

1. **+** → **Chèn câu trả lời của agent…**, chọn agent A.
2. Khung chat chèn "Kết quả từ <space · tab>:" kèm câu trả lời của A.
3. Chọn agent B ở chip nơi nhận, thêm yêu cầu, nhấn **Enter**.

**Phiên con** (việc phụ, không cần pane):

1. Chọn agent cha ở chip nơi nhận.
2. Gõ task, nhấn **Ctrl+Enter**.

Kết quả: "Đã tạo phiên con <địa chỉ> dưới X — xong việc nó sẽ báo về", kèm nút **Xem**. Phiên con cùng loại agent với phiên cha, chạy ở thư mục của phiên cha, hiện dưới phiên cha trong danh sách Agent.

**Dải chip dưới khung chat**:

| Chip | Ý nghĩa và thao tác |
|---|---|
| Máy này · nhánh | Máy và nhánh git của space |
| `16 agents` hoặc `N cần bạn` | Bấm: danh sách agent để chuyển tới; dòng "N cần bạn" mở hộp Cần bạn |
| Phòng ban · 4 | Chỉ khi space có phòng ban. Bấm: mở Bảng việc |
| Thao tác | Menu câu lệnh gửi sẵn (bảng dưới) |
| Opus 5.5 Medium | Chỉ với Claude. Đổi model và effort |
| Tự động | Chỉ với Claude. Đổi chế độ quyền |
| 50% · 5h 19% | Chỉ với Claude. Context đã dùng và giới hạn 5 giờ của gói |
| Biểu tượng bảng | Bật/tắt rail (Ctrl+Shift+R) |

Dải chip đổi theo agent đang nhận tin:

| Agent | Chip |
|---|---|
| Claude Code | Model · Chế độ quyền · Context (% và giới hạn 5 giờ) |
| Codex | Model · **Quyền** (Hỏi khi cần · Tự duyệt an toàn · Toàn quyền · Chỉ đọc; gửi `/permissions` + phím số) · **Hạn mức** (đọc `/status`: context còn trống, hạn mức tháng, giờ reset, quyền hiện tại) |
| Antigravity | Model · **Chế độ** (Hỏi trước · Tự nhận sửa · Tự động · Lập kế hoạch; đổi bằng Shift+Tab cho tới khi dòng cuối đúng chế độ) · **Hạn mức** (đọc `/usage`: hạn mức tuần và 5 giờ theo nhóm model) |

- Model, effort và chế độ của Codex/Antigravity đọc từ dòng cuối màn hình của agent.
- Mở chip Hạn mức là gửi `/status` (Codex) hoặc `/usage` (Antigravity, rồi tự nhấn Esc đóng bảng). Đây là lệnh chỉ đọc chạy tại máy, không tốn quota. Mất khoảng 10 giây; một phút mới đọc lại một lần.
- **`agy --mode auto` vẫn khởi động ở chế độ Hỏi trước** (agy 1.5.4), nên QA Antigravity hỏi duyệt mọi lệnh. Muốn nó tự chạy thì chọn **Tự động** ở chip Chế độ.

**Menu Thao tác**: gửi một câu lệnh soạn sẵn cho agent đang chọn. Chỉ gửi được khi agent rảnh.

| Nhóm | Mục |
|---|---|
| Git | Commit · Commit + PR · Push · Pull về · Tạo branch mới · Merge PR (hỏi lại trước khi gửi) |
| Kiểm tra | Chạy test · Build · Sửa lỗi build/test · Review thay đổi · Build bộ deploy |
| Claude | Tóm tắt việc đã làm · Giải thích thay đổi · Cập nhật tài liệu · Review bảo mật (`/security-review`, chỉ Claude) · Code review (`/code-review`, chỉ Claude) · /compact (Claude, Codex, Antigravity) · /clear (Claude, Antigravity; hỏi lại trước khi gửi) |
| Của tôi | Câu lệnh riêng trong `actions.json` |

Thêm câu lệnh riêng: **Thao tác → Sửa action của tôi…**. File `actions.json` mở trong VS Code; mỗi mục có `label`, `text`, và tuỳ chọn `group`, `confirm`. Lưu file là menu cập nhật.

**Model và effort** (bấm chip model): menu hiện đúng model của agent đang chọn. Phím số chọn nhanh. Chỉ đổi được khi agent rảnh.

| Agent | Model trong menu | Effort | Lệnh khung chat gửi |
|---|---|---|---|
| Claude Code | Opus 5.5, Fable 5.2 (mạnh nhất, đắt hơn), Sonnet 5.5, Haiku 5.5 (phím 1–4). **Thêm model**: Fable 5.1, Haiku 4.5, Sonnet 5, Opus 5, Fable 5, Opus 4.8, Opus 4.7, Opus 4.6, Sonnet 4.6, Mặc định | Low · Medium · High · Extra · Max; Opus/Sonnet 4.6 không có Extra; Haiku 4.5 không chỉnh effort | `/model claude-opus-5-5`, `/effort high` |
| Codex | Danh sách thật từ `codex debug models`, hiện tại: GPT-6-Luna, GPT-5.6-Terra, GPT-5.6-Luna | Theo từng model (Terra có thêm Ultra) | `/model gpt-5.6-terra`, `/model <model đang chạy> --reasoning=high` |
| Antigravity | Danh sách thật từ `agy models`: Gemini 3.8 Flash (High/Medium/Low), Claude Sonnet 4.6, Claude Opus 4.6, GPT-OSS 120B | Low · Medium · High · Extra · Max | `/model gemini-3.8-flash-low`, `/effort medium` |

- Dòng **Thêm model** mở hoặc đóng danh sách bản cũ của Claude; nó tự mở khi phiên đang chạy một bản cũ. Hàng effort chỉ hiện các mức model đang chọn nhận.
- Danh sách của Codex và Antigravity được lấy lại mỗi 12 giờ. Lần đầu (hoặc khi CLI không trả lời) menu dùng danh sách có sẵn.
- Cuối menu của Claude có **Chế độ nhanh (/fast)**: bật/tắt chế độ Opus trả lời nhanh hơn, giá cao hơn, cần usage credits.
- **Claude lưu effort vừa chọn làm mặc định cho mọi phiên mới** (hành vi của Claude Code, có ghi chú dưới hàng effort). Đổi effort cho một phiên tức là đổi luôn mặc định trong `~\.claude\settings.json`.
- Antigravity báo: trên gói hiện tại, model bên thứ ba (Claude 4.6, GPT-OSS) không còn dùng được từ 18/11/2026.

**Chế độ quyền** (bấm chip chế độ):

| Chế độ | Nghĩa |
|---|---|
| Tự động (Khuyên dùng) | Claude tự quyết khi nào cần hỏi quyền |
| Hỏi trước | Luôn hỏi trước khi sửa |
| Tự nhận sửa | Tự nhận mọi sửa file |
| Lập kế hoạch | Lập kế hoạch trước khi sửa |
| Bỏ qua quyền | Nhận mọi quyền (rủi ro, xem mục 11) |

Khung chat đổi chế độ bằng cách nhấn Shift+Tab trong Claude cho tới khi đúng chế độ. Báo "Claude đang mở hộp thoại…" thì nhấn Esc trong pane rồi đổi lại.

**Ngữ cảnh** (bấm chip %):

- Phần trăm context đã dùng, số token còn lại.
- Chi phí, thời gian, số dòng code của phiên.
- Giới hạn 5 giờ và giới hạn tuần của gói, kèm giờ reset. Thanh chuyển vàng từ 70%, đỏ từ 90%.
- Nút **Compact phiên**: gửi `/compact`. Nên bấm khi context vượt khoảng 70%.

**Mở lại phiên sau khi khởi động lại máy**: herdr-core giữ các terminal nhưng chỉ trả lại shell, không chạy lại agent. Khi app mở lại, khung chat tự mở lại các phiên **Claude**:

- Nó gõ `claude --resume <phiên>` từng phím vào terminal đó, kèm `--model`/`--effort` của vai nếu là thành viên phòng ban, và báo "Đã mở lại N phiên Claude sau khi khởi động lại". Gõ từng phím vì dán lệnh từng bị hỏng thành `[200~claude…`.
- Nó chỉ gõ khi terminal đang ở dấu nhắc của shell, và nhấn Ctrl+C trước để xoá dòng dở.
- Lần nào chưa lên thì thử lại sau 1 phút, tối đa 2 lần.
- Phiên bạn tự tắt không bị mở lại.
- Phiên mà Claude báo "No conversation found" là đã mất. Gõ `claude --continue` để mở cuộc trò chuyện gần nhất của thư mục.

Thành viên phòng ban dùng Codex hoặc Antigravity không tự mở lại được: dùng nút **Khởi động lại** trên Bảng việc (mục 6.2).

### 4.4 Rail phiên

Rail bên phải tóm tắt space đang chọn. **Ctrl+Shift+R** bật/tắt. Rail hẹp dưới 230 px thành dải icon.

- **Đầu rail**: **Terminal mới (tab)**, **Diff (tab)**, **Files (tab)**, **⋯** (Phiên mới, Mở dự án, Cần bạn, Phòng ban mới…, Phím tắt, Cài đặt), ẩn rail.
- **Môi trường**: máy (bấm mở Cài đặt → Machines) và thư mục (bấm mở Explorer). Rê chuột vào thư mục: **Chép đường dẫn**, **Mở trong VS Code**, **Terminal tại đây (tab mới)**.
- **Git**:
  - Nhánh (bấm để chép tên).
  - "↑N chưa push · ↓N chưa kéo về", với các nút:
    - **Fetch**: rail tự chạy `git fetch --prune`.
    - **Pull**, **Push**: nhờ agent làm.
  - "N file thay đổi": bấm để xem danh sách. Bấm một file để mở Diff ở file đó; chuột phải để mở trong VS Code.
  - Thẻ PR của nhánh (từ `gh`): trạng thái (Đang mở, Nháp, Đã merge, Đã đóng), checks, review. Chưa có PR: nút **Tạo PR** (nhờ agent commit và tạo PR).
- **Agent**: các agent của space và phiên con.
- **Ngữ cảnh**: context của phiên Claude chia theo loại (tin nhắn, công cụ, MCP, kỹ năng, tệp bộ nhớ…), ước tính từ transcript. Số chính xác: gõ `/context` trong Claude.
- **Kết nối**, **Kỹ năng**, **Plugin**: MCP server, skill, plugin của phiên Claude.
- **Đầu ra**: các file phiên đã tạo hoặc sửa. Bấm để mở trong VS Code.

### 4.5 Cần bạn

Hộp **Cần bạn** gom mọi agent đang hỏi hoặc vừa xong việc, để bạn trả lời mà không phải tìm pane.

1. Nhấn **Ctrl+Shift+Space**, hoặc bấm **Cần bạn** ở sidebar.
2. Hộp hiện một agent mỗi lần: dấu chấm, nhãn vai, "<space> · <tab>", và "đang chờ bạn chọn" hoặc "đã xong việc".
3. Agent đang hỏi:
   - Câu hỏi nằm trong khung. Câu hỏi nhiều bước có dải chip bước.
   - Mỗi lựa chọn là một thẻ. Thẻ có nhãn **Khuyến nghị** là lựa chọn agent đề xuất. Thẻ "↵ đang chọn" là chỗ con trỏ đang đứng trong terminal.
   - Nhấn phím số **1–9** hoặc bấm thẻ để chọn.
   - Lựa chọn tự gõ: gõ vào ô "Gõ câu trả lời của bạn…", nhấn **Enter**.
   - "Trao đổi thêm trong pane thay vì chọn": chuyển tới pane để nói chuyện tiếp.
4. Agent đã xong: bấm nhanh **ok**, **cứ theo đề xuất**, **tiếp tục**, hoặc gõ vào ô "Trả lời agent…".
5. Nhiều agent đang chờ: **↑/↓** chuyển agent, chip "n/tổng" ở tiêu đề. Trả lời xong một agent, hộp chuyển sang agent kế; hết thì tự đóng.

Trước khi gửi, hộp đọc lại màn hình agent. Câu hỏi đã đổi thì không gửi gì và báo "Câu hỏi đã thay đổi — Chưa gửi gì — xem lại câu hỏi mới." Đồng hồ đếm ngược trên câu hỏi không làm hỏng việc chọn.

Hộp chỉ hiểu dạng câu hỏi có lựa chọn đánh số của Claude Code. Câu hỏi của agent khác, hoặc khi hiện "Đang đọc câu hỏi…" quá lâu: bấm **Mở pane** để trả lời trong terminal.

### 4.6 Tệp, Thay đổi, Diff

Ba nút ở góc phải thanh tab mở thành tab của space, rộng để đọc.

| Tab | Dùng để |
|---|---|
| Tệp | Cây thư mục của space. Bấm file để xem (chỉ đọc, có tô màu cú pháp). Chữ A/M/D/U cho biết trạng thái git |
| Thay đổi | Danh sách file chưa commit kèm +/−, diff từng file, ô commit |
| Diff | Danh sách file bên trái, diff bên phải; **Gộp** hoặc **Hai cột**; nút **Mở trong VS Code**, **Mở thư mục**. **J/K** hoặc **↓/↑** chuyển file |

Ô **Commit** của tab Thay đổi chạy `git add -A` rồi `git commit`: nó commit **mọi** file đang đổi. Với dự án có phòng ban, để Điều phối commit qua nút **Duyệt**.

Tab Diff chỉ đọc được space trên máy này.

## 5. Phòng ban AI

Phòng ban là một nhóm agent cùng làm một dự án, mỗi agent một vai. Bạn chỉ nói chuyện với **Điều phối**. Điều phối làm rõ yêu cầu, viết phiếu việc, giao cho DEV/QA/Review, kiểm tra git sau mỗi bước và báo lại bạn. Commit và PR chỉ xảy ra khi bạn bấm **Duyệt**.

### 5.1 Vai trong phòng ban

| Vai | Làm gì | Màu |
|---|---|---|
| Điều phối | Trò chuyện với bạn, viết phiếu, chia việc, kiểm soát git. Không tự sửa code | Tím |
| DEV | Viết code đúng phạm vi phiếu, test trước khi sửa khi làm được | Xanh dương |
| DEV (hướng 2) | Làm cùng việc theo cách khác để so sánh | Xanh dương |
| QA | Trước khi DEV làm: viết test tái hiện. Sau khi DEV làm: build, lint, chạy toàn bộ test | Xanh lá |
| Review | Chỉ đọc diff, đối chiếu tiêu chí xong, soát bảo mật. Tối đa 10 vấn đề, kèm file:dòng | Xanh ngọc |
| Nghiên cứu | Chỉ đọc code và tài liệu, trả lời có dẫn nguồn | Vàng |
| Trinh sát | Phiên con ngắn cho từng việc Vừa/Lớn, không phải thành viên cố định: gom bối cảnh trước khi DEV làm (mục 7.6) | Vàng |
| Docs | Chỉ sửa README, CHANGELOG, docs/ | Vàng |

Màu vai giống nhau ở mọi nơi: tên trên Bảng việc, nhãn vai trên đầu pane, nhãn trong hộp Cần bạn.

### 5.2 Mẫu đội

| Mẫu | Thành viên | Khi nào dùng |
|---|---|---|
| Chuẩn | Điều phối, DEV (Claude) · QA (Antigravity) · Review (Codex) | Đủ quy trình, Codex rà diff cuối mỗi việc một lần |
| Toàn Claude | Cả 4 vai là Claude Code | Không tốn quota Codex, Antigravity |
| Tiết kiệm | Điều phối, DEV (Claude) · QA (Antigravity) | Không dùng Codex: QA rà luôn diff |
| Hai hướng | Điều phối, DEV (Claude) · DEV (hướng 2) (Antigravity) · Review (Codex) | Hai agent cùng làm một việc để so sánh |
| Nghiên cứu | Điều phối (Claude) · Nghiên cứu (Antigravity) · Review (Claude) | Tìm hiểu, không sửa file |

Model và effort mặc định của Claude theo vai:

| Vai | Model | Effort |
|---|---|---|
| Điều phối | Opus | medium |
| DEV, DEV (hướng 2) | Opus | xhigh |
| Review | Opus | high |
| QA | Sonnet | high |
| Nghiên cứu | Sonnet | medium |
| Docs | Haiku | low |

Codex dùng model theo tài khoản. Codex làm Review chạy chế độ chỉ đọc (`-s read-only`), không hỏi ai. Antigravity chạy `--mode auto`.

**Combo khuyến nghị khi quota Codex (gói free) eo hẹp**: chọn mẫu **Chuẩn**, rồi đổi vai:

| Vai | Agent · model · effort | Lý do |
|---|---|---|
| Điều phối | Claude Code · Opus · medium | Trò chuyện, lập phiếu, chia việc: không cần suy luận sâu |
| DEV | Claude Code · Opus · xhigh | Viết code là chỗ đáng tiêu mạnh nhất |
| QA | Claude Code · Sonnet · high, hoặc Antigravity · Gemini 3.8 Flash (High) | Chạy build/test, viết test tái hiện. Chọn Antigravity để đỡ quota Claude |
| Review | Antigravity · Gemini 3.8 Flash (High) · high | Khác họ model với DEV nên không chung điểm mù, và không tốn quota Codex |

Lưu ý khi chọn model cho Review:

- Không chọn model Claude trong Antigravity (Claude Sonnet 4.6, Claude Opus 4.6) cho Review: Review lại cùng họ với DEV. Hộp cảnh báo chỉ so loại agent, nên không bắt được trường hợp này.
- Chọn hẳn một model, đừng để **Mặc định**: không biết chắc Antigravity mặc định chạy model nào.
- Không có Codex trong đội thì bước "Review vòng 2" (nhịp Kỹ) do Review hiện có làm.


### 5.3 Tạo phòng ban

Mục tiêu: dựng một phòng ban cho dự án đang mở.

1. Chọn space của dự án ở sidebar (phòng ban gắn với space đang chọn).
2. Nhấn **Ctrl+Shift+D**, hoặc bấm dòng **Phòng ban** ở sidebar. Nếu đã có phòng ban, hộp hiện danh sách trước: bấm **Phòng ban mới**.
3. **Tên**: mặc định là tên space.
4. **Mẫu đội**: chọn một mẫu ở bảng 5.2.
5. **Vai và agent · bấm một vai để chọn model, effort**:
   - Ba biểu tượng bên phải mỗi vai chọn agent: Claude Code, Codex, Antigravity.
   - Bấm vào vai để mở hàng **Model** và **Effort**, chọn một ô mỗi hàng.
   - **Khôi phục mặc định** đưa về như bảng trên.
   - Nếu DEV và Review cùng loại agent, hộp cảnh báo: "DEV và Review cùng một loại agent: dễ chung điểm mù. Nên chọn Review là Codex hoặc Antigravity."
6. **Làn chạy cùng lúc**: 1, 2 hoặc 3 (lần đầu là 2). Xem mục 7.
   - Từ 2 làn có thêm dòng **Kiểm tra ở làn phụ**: Dùng chung, QA riêng (lần đầu), QA + Review riêng, DEV tự test. Xem mục 7.4.
7. **Nhịp làm việc**: Nhanh, Chuẩn hoặc Kỹ (lần đầu là Chuẩn). Xem mục 7.
8. **Bố cục**: cách xếp các pane trong tab phòng ban (lần đầu là Chữ T). Làn, nhịp và bố cục nhớ lựa chọn lần trước.

   | Bố cục | Cách xếp |
   |---|---|
   | Chữ T | Điều phối trái, DEV trên, cả đội hàng dưới |
   | Ba cột | Điều phối · DEV · cả đội xếp dọc |
   | Tập trung | Điều phối rộng, cả đội cột phải |
   | Lưới | Hai cột: Điều phối và DEV ở trên |

9. Bấm **Tạo phòng ban**. Hộp chuyển sang "Đang dựng phòng ban…" và hiện trạng thái từng thành viên: "đang khởi động…", "sắp nhận lời dặn…", "hỏi tin tưởng thư mục".
10. Agent nào "hỏi tin tưởng thư mục": bấm **Tin tưởng** (trả lời Có cho câu hỏi tin tưởng thư mục), hoặc **Xem** để tự trả lời trong pane.
11. Khi hiện "Phòng ban đã sẵn sàng", bấm **Mở bảng việc**.

Kết quả: một tab "Phòng ban · <tên>" chứa các pane agent, và một tab **Bảng việc**. Đóng hộp giữa chừng không sao: Bảng việc tự gửi lời dặn cho từng agent khi nó sẵn sàng.

### 5.4 Danh sách phòng ban

Nhấn **Ctrl+Shift+D** khi đã có phòng ban: hộp **Phòng ban** hiện "N đang hoạt động · M đã dừng".

- Mỗi phòng ban có nút **Bảng việc** để mở bảng của nó.
- Mỗi dòng có số việc chờ duyệt, số việc đang làm, và số agent đang chạy.
- Phòng ban đã dừng có nút × "Bỏ khỏi danh sách (phiếu việc vẫn giữ)", bấm lần nữa ở "Bỏ khỏi danh sách?" để xác nhận. Phiếu việc trên đĩa không bị xoá.
- Dòng dưới cùng cho biết phòng ban mới sẽ nằm ở space nào.

Trong sidebar, space có phòng ban mang huy hiệu người kèm số thành viên đang chạy (ví dụ `4`): xanh khi còn chạy, xám khi đã dừng. Bấm huy hiệu, hoặc chip **Phòng ban · 4** dưới khung chat, để mở Bảng việc của space đó.

### 5.5 Nói chuyện với phòng ban

- **Giao việc**: bấm **Việc mới** trên Bảng việc (mục 6.4), hoặc nhắn Điều phối trong khung chat.
- **Nhắn thẳng một thành viên**: bắt đầu tin bằng `@vai`, ví dụ `@dev xem lại hàm parse`. Khung chat chỉ gửi phần sau `@vai` cho đúng thành viên đó.
  - Vai nhận được: `@lead`, `@dieu-phoi`, `@dev`, `@qa`, `@test`, `@review`, `@research`, `@docs`. Không phân biệt hoa thường, bỏ dấu.
- Nên để Điều phối giao việc. Nhắn thẳng DEV làm Điều phối mất dấu tiến độ trên phiếu.

## 6. Bảng việc

Bảng việc là tab **Bảng việc** của space có phòng ban. Nó đọc các phiếu `T-n.md` do Điều phối ghi. **Bảng việc không tự chuyển phiếu**: mọi nút (Việc mới, Duyệt, Sửa thêm, đổi cỡ, đổi nhịp, đổi làn) đều nhắn Điều phối, rồi Điều phối sửa phiếu.

### 6.1 Thanh công cụ

Từ trái sang phải:

| Phần | Ý nghĩa và thao tác |
|---|---|
| Tên phòng ban | Dòng dưới: "Phòng ban · N thành viên · M việc". Thông báo ngắn sau mỗi thao tác hiện thay dòng này trong vài giây |
| **Bảng** \| **Hoạt động** | Hoạt động mở bảng bên phải: các dòng nhật ký mới nhất của mọi phiếu |
| Ba biểu tượng nhịp | Tia sét = Nhanh, cái cân = Chuẩn, khiên = Kỹ. Rê chuột xem mô tả. Bấm để đổi nhịp; bấm lại nhịp đang chọn để gửi lại luật nhịp cho Điều phối |
| **Làn** 1 2 3 | Số việc chạy cùng lúc. Bấm lại số đang chọn để gửi lại luật làn |
| Chip ví `$38.39` | Chi phí ước tính. Bấm để đặt ngưỡng (mục 6.7) |
| Chuông "N chờ duyệt" | Chỉ hiện khi có phiếu chờ bạn duyệt. Bấm để mở phiếu đó |
| **Việc mới** | Tạo phiếu mới (mục 6.4) |
| Biểu tượng sổ | Mở NOTES.md của phòng ban trong VS Code |
| **⋯** | **Gửi lại lời dặn cho cả đội** · **Đặt ngưỡng chi phí…** · **Kiểm tra ở làn phụ** (Dùng chung, QA riêng, QA + Review riêng, DEV tự test; mục 7.4) · **Mở thư mục phiếu việc** · **Tạo phòng ban khác…** |

### 6.2 Thành viên và cột

Hàng thành viên nằm trên các cột. Mỗi thành viên có logo agent, chấm trạng thái và một dòng phụ:

| Dòng phụ | Nghĩa |
|---|---|
| đang chạy · Opus xhigh | Đang làm, kèm model và effort |
| rảnh · Opus xhigh | Đang rảnh |
| đang làm · T-10 | Đang giữ phiếu T-10 |
| cần bạn trả lời | Đang chờ bạn, có banner câu hỏi ở trên |
| hỏi tin tưởng thư mục | Kẹt ở câu hỏi tin tưởng: bấm **Tin tưởng** cạnh tên |
| đã dừng · chỉ còn shell | Agent đã tắt (thường do khởi động lại máy), terminal chỉ còn shell: bấm **Khởi động lại** cạnh tên. Bảng việc gõ lại lệnh của vai (đúng agent, model, effort) và gửi lời dặn khi nó sẵn sàng. **⋯ → Khởi động lại N thành viên đã dừng** làm cho tất cả |
| chờ nhận lời dặn / đang khởi động | Mới mở, chưa nhận lời dặn |
| đã thoát | Agent đã tắt |

Bấm vào thành viên để chuyển tới pane của nó. Khi có agent làn cùng vai, DEV, QA hoặc Review có nhãn "+N làn" và dòng phụ cho biết agent chính đang làm gì cùng các làn, ví dụ "rảnh · làn T-9" hoặc "T-10 · làn T-9, T-8".

Năm cột theo `status` của phiếu: **Chờ** · **Đang làm** · **Kiểm tra** · **Chờ bạn duyệt** · **Xong**. Cột Xong thu thành dải hẹp có số đếm ("Xong · bấm để mở"). Trong cột Kiểm tra, các thẻ được đánh số theo thứ tự xếp hàng QA/Review.

### 6.3 Thẻ việc

Mỗi thẻ hiện, từ trên xuống:

1. Mã (T-n) và các nhãn: **Gấp** (đỏ, phiếu có `priority: cao`), kết quả bàn giao mới nhất (✓ "DEV đạt", ✗ "QA chưa đạt", ? "cần quyết"), cỡ **Nhỏ**/**Vừa**/**Lớn**.
2. Tên việc.
3. Thanh bước: các vạch xanh lá là bước đã xong, vạch xanh dương là bước hiện tại, kèm tên bước và "k/n" (ví dụ "QA test tái hiện · 1/5").
4. Dòng ghi chú mới nhất của Điều phối; phiếu chưa có ghi chú thì hiện vai đang giữ, số tiêu chí đã xong và thời gian (ví dụ "DEV · 2/5 · 10 phút").
5. Ô làn: nhánh git của việc (ví dụ `fix/t10-npm-audit`). Việc chạy ở làn phụ có nhãn agent của làn: "DEV·T-7" khi chỉ có DEV làn, hoặc **DEV** **QA** **RV** khi làn có QA/Review riêng; **TS** khi trinh sát đang chạy (mục 7.6). Việc nghiên cứu có nhãn "NC·T-6" với chữ "chỉ đọc · không worktree". Bấm một nhãn để xem agent đó.
6. "chờ làn trống (1/1)": việc ở cột Chờ khi đã hết làn.
7. Cảnh báo "trùng file" khi hai làn sửa cùng file.
8. Ở cột Chờ bạn duyệt: nút **Duyệt** và **Sửa thêm**.

Bấm thẻ để mở phiếu (mục 6.5).

### 6.4 Tạo việc mới

Mục tiêu: giao một việc cho phòng ban.

1. Bấm **Việc mới**. Thanh nhập hiện dưới thanh công cụ: "Việc mới … Enter gửi · Esc huỷ".
2. Gõ một câu mô tả việc, nhấn **Enter**.

Kết quả: bảng tạo file `T-n.md` ở cột Chờ và nhắn Điều phối: "Đã tạo T-n và nhắn Điều phối". Điều phối làm rõ với bạn nếu cần, viết đủ phiếu (Mục tiêu, Phạm vi, Tiêu chí xong, Rủi ro), ghi cỡ, rồi chia việc.

Khi gặp lỗi: "Không tạo được T-n: …" nghĩa là không ghi được thư mục `tasks` của phòng ban.

### 6.5 Xem phiếu

Bấm một thẻ: phiếu thả xuống từ thanh công cụ, nền bảng tối đi.

- Dòng đầu: mã, tên, trạng thái, nút đóng.
- Dòng phụ: ai đang giữ, số tiêu chí đã xong, ghi chú.
- Ô chọn cỡ **Nhỏ** · **Vừa** · **Lớn**, và chuỗi bước của cỡ đó ở nhịp hiện tại (bước hiện tại được tô).
- Nội dung phiếu (Mục tiêu, Phạm vi, Tiêu chí xong, Rủi ro).
- **Bối cảnh** (khi có): file bối cảnh trinh sát đã gom cho việc này (mục 7.6).
- **Báo cáo bàn giao**: 4 báo cáo mới nhất của các vai, mỗi báo cáo có Kết quả, Test, File đổi, Cần quyết định.
- **Nhật ký**: các dòng "ngày giờ vai: việc".
- Nút: **Mở phiếu** (mở file trong VS Code), **Sửa thêm**, **Duyệt** (khi phiếu chờ duyệt).

Đóng phiếu: bấm ra ngoài, nhấn **Esc**, hoặc bấm nút đóng.

Đổi cỡ: bấm Nhỏ/Vừa/Lớn. Bảng nhắn Điều phối đổi `size` và đi tiếp theo đường của cỡ mới: "Đã đổi cỡ T-n và nhắn Điều phối".

### 6.6 Duyệt và yêu cầu sửa

Mục tiêu: chốt một việc đã xong, hoặc trả lại để sửa.

1. Khi có việc chờ duyệt, chuông "N chờ duyệt" hiện trên thanh công cụ. Bấm chuông, hoặc bấm thẻ ở cột Chờ bạn duyệt.
2. Đọc **Báo cáo bàn giao** (kết quả test, review, rủi ro). Cần xem code: tab **Diff** hoặc **Thay đổi** (mục 4.6).
3. Bấm **Duyệt**: "Đã gửi duyệt T-n: Điều phối sẽ commit/PR rồi chuyển phiếu". Thẻ hiện "Đã gửi duyệt · chờ Điều phối" tới khi Điều phối chuyển phiếu sang Xong.
4. Hoặc bấm **Sửa thêm**, gõ điều cần sửa, nhấn **Enter**: "Đã nhắn Điều phối sửa T-n". Điều phối đưa phiếu về Đang làm và giao lại.

Khi gặp lỗi:

- "Điều phối đang hỏi bạn: đã mở pane của nó để bạn trả lời": Điều phối đang chờ một câu trả lời, nên tin chưa được gửi (gửi lúc này sẽ thành câu trả lời). Trả lời trong pane, rồi bấm lại.
- "Điều phối đã thoát: tạo lại phòng ban ở menu ⋯": pane Điều phối đã tắt. Tạo lại phòng ban.
- "Không gửi được cho Điều phối": lệnh gửi thất bại. Thử lại, hoặc nhắn trong khung chat.

### 6.7 Chi phí và ngưỡng

Chip ví trên thanh công cụ là **chi phí ước tính theo giá API** của các phiên Claude đang mở trong phòng ban: Điều phối, các thành viên, các DEV làn. Rê chuột để xem theo vai.

- Bạn dùng gói đăng ký Claude, nên con số này là mức tương đương giá API, không phải hoá đơn. Dùng nó để so độ tốn giữa các cách làm.
- Codex và Antigravity không báo chi phí, nên không có trong tổng.
- Làn đã đóng không còn được tính.

Đặt ngưỡng:

1. Bấm chip ví, hoặc **⋯ → Đặt ngưỡng chi phí…**.
2. Gõ số USD (ví dụ `20`), nhấn **Enter**. Gõ `0` để bỏ ngưỡng.

Kết quả: chip hiện "$12.30 / $20" và chuyển màu hổ phách khi chạm ngưỡng. Ngưỡng chỉ để cảnh báo, không dừng agent.

### 6.8 Câu hỏi của thành viên

Khi một thành viên chờ bạn, một banner vàng hiện dưới thanh công cụ: "<Vai> đang hỏi bạn", kèm câu hỏi đọc từ màn hình của nó. Bấm **Trả lời** để chuyển tới pane của nó. Cũng có thể trả lời qua hộp **Cần bạn** (mục 4.5).

### 6.9 Điều phối được gọi dậy thế nào

Điều phối giao việc xong thì kết thúc lượt, không ngồi chờ từng người. Hai tín hiệu độc lập gọi nó dậy, cái nào tới trước thì xử lý:

1. **Chờ nền của chính Điều phối**: sau mỗi lần giao, nó chạy nền `hc wait <người được giao> --timeout 3600`. Người đó dừng là Claude Code gọi Điều phối dậy, không cần Bảng việc.
2. **Bảng việc nhắn** một tin bắt đầu bằng "Bảng việc: có tin mới từ đồng đội.", khi:
   - Một file trong `handoff` mới xuất hiện hoặc dài thêm. Báo cáo viết kiểu gì cũng được nhận: mã và vai lấy từ tên file (`T-8-qa.md`), kết quả đọc cả dạng `**Kết quả:** ĐẠT`.
   - Một đồng đội (kể cả agent làn) đã làm xong một lượt và đang rảnh mà không có báo cáo mới. Tin kèm lệnh `hc read` để Điều phối đọc màn hình của đồng đội đó.

Tin chỉ gửi khi Điều phối rảnh, nhiều tin gộp một lần, và không dán chồng lên nút bạn vừa bấm.

Bảng việc không giữ gì trong bộ nhớ. Mỗi 5 giây nó đọc lại thư mục `handoff` và số lượt của từng agent (`hc ls`), rồi so với "đã báo tới đâu" lưu trong bản ghi phòng ban. Vì vậy nạp lại app, sửa mod hay đóng rồi mở lại tab Bảng việc đều không làm mất tin: mở lại là nó báo bù. Lần đầu chạy cho một phòng ban, nó báo các báo cáo sửa trong 30 phút gần nhất.

## 7. Làn, nhịp và cỡ việc: cơ chế chi tiết

Ba núm này quyết định tốc độ, độ kỹ và chi phí:

| Núm | Thuộc về | Ai đặt | Quyết định |
|---|---|---|---|
| Làn (1–3) | Cả phòng ban | Bạn, trên thanh công cụ | Bao nhiêu việc chạy cùng lúc |
| Nhịp (Nhanh/Chuẩn/Kỹ) | Cả phòng ban | Bạn, trên thanh công cụ | Mỗi cỡ việc đi qua những bước nào |
| Cỡ (Nhỏ/Vừa/Lớn) | Từng phiếu | Điều phối ước lượng, bạn sửa trong phiếu | Chọn đường nào trong nhịp |

Phiếu chưa có cỡ được tính là Vừa. Nhịp không tự đổi theo từng việc.

### 7.1 Làn

Một làn là một việc đang chạy (một thẻ ở cột Đang làm). Bảng đếm số thẻ Đang làm và so với số làn.

- **Việc code thứ nhất** do DEV chính làm, trong thư mục dự án.
- **Việc code thêm** (khi DEV chính đang giữ việc khác): Điều phối tạo một worktree riêng cạnh dự án (`<thư mục cha>\_wt\<tên>-<mã>`, nhánh riêng) và mở một DEV riêng cho làn đó. DEV làn không có pane, chạy cùng model với DEV chính. Bảng việc tự gửi lời dặn cho nó.
- **Việc nghiên cứu** cũng chiếm một làn, nhưng chỉ đọc: không worktree, kết quả ghi vào thư mục `research` của phòng ban.
- **QA và Review cho làn phụ**: theo tuỳ chọn **Kiểm tra ở làn phụ** của phòng ban (mục 7.4). Mặc định **QA riêng**.
- **Trước khi chờ duyệt**: Điều phối so file đổi của làn với nhánh chính và các làn khác. Trùng file thì ghi `conflict:` vào phiếu, thẻ hiện "trùng file".
- **Duyệt xong**: Điều phối đóng mọi agent của làn (DEV, QA, Review làn). Worktree được giữ nguyên, bạn tự dọn (`git worktree remove <đường dẫn>`).

Khi một làn trống, Điều phối chọn việc chờ tiếp theo theo thứ tự:

1. Việc có `priority: cao` (thẻ **Gấp**).
2. Việc nhỏ trước (xong nhanh, giải phóng làn).
3. Mã nhỏ hơn trước.

Muốn một việc đi trước: gõ `@lead T-8 gấp` trong khung chat, hoặc tự thêm dòng `priority: cao` vào front matter của phiếu.

### 7.2 Ví dụ: cùng một bảng với 1, 2, 3 làn

Làn không gắn với cỡ: 3 làn là 3 việc bất kỳ chạy cùng lúc, có thể cả 3 đều Nhỏ. Mỗi việc đi đường của cỡ mình trong nhịp chung.

Bảng Acme.Shop có: T-10 (Vừa) đang làm, T-9 (Nhỏ) và T-8 (Lớn) đang chờ.

| Số làn | Chạy ngay | Chờ | Thứ tự |
|---|---|---|---|
| 1 | T-10 | T-9, T-8 hiện "chờ làn trống (1/1)" | T-10 → T-9 → T-8 |
| 2 | T-10, T-9 (làn phụ, worktree riêng) | T-8 | T-8 vào khi một trong hai rời Đang làm |
| 3 | T-10, T-9, T-8 (mỗi việc thêm một worktree và một DEV) | Không | Với QA riêng: chỉ Review xếp hàng ở Kiểm tra |

Đánh đổi:

- Mỗi làn thêm là một phiên Claude nữa (DEV chính dùng Opus xhigh), tốn quota. QA làn (nếu mở) là thêm một phiên nữa.
- Máy chạy nhiều build và test cùng lúc: nặng CPU, RAM.
- Làn = 1 an toàn nhất cho các việc sửa cùng file.
- Khi DEV chính đang **rảnh** (việc của nó đang ở bước QA viết test tái hiện) mà còn việc chờ, tăng lên 2 làn để không phí thời gian.

### 7.3 Nhịp và đường đi của từng cỡ

| Nhịp | Nhỏ | Vừa | Lớn |
|---|---|---|---|
| Nhanh | DEV làm gọn → QA test liên quan → Chờ bạn duyệt | Trinh sát → DEV làm → QA chạy test → Chờ bạn duyệt | Trinh sát → QA test tái hiện → DEV làm → QA chạy test → Review → Chờ bạn duyệt |
| Chuẩn | DEV làm gọn → QA test liên quan → Chờ bạn duyệt | Trinh sát → QA test tái hiện → DEV làm → QA chạy test → Review → Chờ bạn duyệt | Bạn duyệt phiếu → Trinh sát → QA test tái hiện → DEV làm → QA chạy test → Review → Chờ bạn duyệt |
| Kỹ | DEV làm → QA test liên quan → Review → Chờ bạn duyệt | Bạn duyệt phiếu → Trinh sát → QA test tái hiện → DEV lập kế hoạch → Review duyệt kế hoạch → DEV làm → QA chạy test → Review → Chờ bạn duyệt | Như Vừa, thêm Review vòng 2 trước Chờ bạn duyệt |

Việc nghiên cứu ở mọi nhịp: Nghiên cứu → Chờ bạn duyệt (không có Trinh sát).

Ý nghĩa các bước:

| Bước | Ai làm gì |
|---|---|
| Bạn duyệt phiếu | Điều phối đưa phiếu cho bạn duyệt trước khi giao |
| Trinh sát | Một phiên con Claude Sonnet chỉ đọc gom bối cảnh vào `context\<mã>.md`: file và dòng liên quan, mẫu có sẵn, test và lệnh chạy, bẫy. DEV và QA đọc file này trước khi làm (mục 7.6) |
| QA test tái hiện | QA dò chỗ bị ảnh hưởng, viết test tái hiện (chỉ sửa file test) |
| DEV lập kế hoạch | DEV viết kế hoạch ngắn vào phiếu (file sẽ sửa, cách làm, test sẽ viết), chưa sửa code |
| Review duyệt kế hoạch | Review duyệt kế hoạch trước khi code. Rẻ hơn sửa code sai hướng |
| DEV làm gọn | DEV làm, không mở rộng phạm vi. DEV làn chạy effort high |
| QA test liên quan | QA chạy các test liên quan |
| QA chạy test | QA build, chạy lint, typecheck và toàn bộ test. Phải đạt trước khi Review |
| Review / Review vòng 2 | Review đọc code đã qua test. Vòng 2 dùng Codex nếu đội có |
| Chờ bạn duyệt | Điều phối đặt phiếu sang Chờ bạn duyệt và báo bạn |

Luật chung ở mọi nhịp:

- Test tự động (QA) chạy trước Review. Review chỉ đọc code đã đạt test.
- Ở nhịp Nhanh và Chuẩn, "QA test tái hiện" và "DEV làm" được giao cùng lúc (mục 7.5). Bảng trên vẫn ghi theo thứ tự logic.
- Sửa tối đa 2 vòng. Hết 2 vòng vẫn chưa đạt: Điều phối dừng, ghi "cần bạn quyết" và hỏi bạn.
- Commit và PR luôn chờ bạn bấm **Duyệt**. Không nhịp nào tự merge, deploy hay push nhánh chính.
- Đội thiếu vai thì bỏ bước của vai đó: không có Review thì bỏ các bước Review; không có QA thì bỏ bước QA test tái hiện và DEV tự chạy test.

Đổi nhịp giữa chừng: các việc đang chạy đi tiếp theo đường của nhịp mới từ bước hiện tại. Đổi cỡ một phiếu: như mục 6.5.

### 7.4 QA và Review cho làn phụ

Mỗi việc gọi QA hai lần (viết test tái hiện, rồi chạy test) và Review một lần. Dùng chung một QA cho nhiều làn thì các làn phải chờ nhau. Tuỳ chọn **Kiểm tra ở làn phụ** quyết định ai kiểm việc của các làn phụ:

| Tuỳ chọn | Cách chạy | Thêm phiên |
|---|---|---|
| Dùng chung | QA và Review chính làm lần lượt cho mọi làn | 0 |
| QA riêng (mặc định) | QA chính rảnh thì làm; QA chính bận thì Điều phối mở QA riêng cho làn đó (cùng agent, model, effort như vai QA). Review dùng chung | Tối đa 1 mỗi làn phụ |
| QA + Review riêng | Như trên, cho cả QA và Review | Tối đa 2 mỗi làn phụ |
| DEV tự test | DEV làn tự chạy build, lint, typecheck, test; QA chung chỉ viết test tái hiện | 0, nhưng mất bước kiểm độc lập |

- QA làn chỉ được mở khi QA chính đang bận, nên không có phiên nào ngồi không.
- QA làn chạy trong worktree của làn, dùng cổng và dữ liệu test riêng. Test buộc dùng chung cổng hoặc CSDL thì QA báo Điều phối để chạy lần lượt.
- Đặt khi tạo phòng ban (dòng **Kiểm tra ở làn phụ**, hiện khi chọn từ 2 làn), hoặc trên Bảng việc ở **⋯ → Kiểm tra ở làn phụ**. Đổi tuỳ chọn là Bảng việc nhắn luật mới cho Điều phối; bấm lại tuỳ chọn đang chọn để gửi lại luật.
- Trên thẻ, ô làn hiện mọi agent của làn: **DEV**, **QA**, **RV** (Review). Bấm một nhãn để xem agent đó. QA và Review chính có nhãn "+N làn" khi đang có QA/Review làn.

### 7.5 Tính nhanh chỗ nghẽn

Tốc độ của cả phòng ban bằng tốc độ của vai chậm nhất. Với mỗi vai:

> Số việc mỗi giờ = số agent của vai × 60 ÷ số phút vai đó tốn cho một việc

Ví dụ ước lượng cho việc Vừa, nhịp Chuẩn (thời gian thật tuỳ dự án): QA test tái hiện 5 phút, DEV 15 phút, QA chạy test 6 phút, Review 4 phút. QA tốn 11 phút mỗi việc.

| 3 làn | DEV | QA | Review | Cả phòng ban |
|---|---|---|---|---|
| Dùng chung | 3 × 60 ÷ 15 = 12 việc/giờ | 1 × 60 ÷ 11 ≈ 5,5 | 60 ÷ 4 = 15 | **≈ 5,5 việc/giờ** (QA nghẽn) |
| QA riêng | 12 | 3 × 60 ÷ 11 ≈ 16 | 15 | **≈ 12 việc/giờ** (DEV quyết định) |

Quy tắc ngón tay: một vai dùng chung bắt đầu nghẽn khi **số làn × số phút của vai đó > số phút của DEV**.

- QA: 2 làn × 11 = 22 > 15, nên từ 2 làn đã nên dùng QA riêng.
- Review nhanh (Antigravity, khoảng 4 phút): 3 × 4 = 12 < 15, dùng chung vẫn ổn.
- Review chậm (Codex, khoảng 8–10 phút): 2 × 8 = 16 > 15, nên chọn **QA + Review riêng**.

Ba thay đổi khác cũng rút thời gian chờ:

- **QA test tái hiện chạy song song với DEV** ở nhịp Nhanh và Chuẩn: giao cả hai cùng lúc. DEV không sửa file test của QA, và phải cho test tái hiện chạy đạt trước khi báo xong. Mỗi việc bớt một bước nối tiếp (khoảng 5 phút trong ví dụ trên). Nhịp Kỹ giữ đúng thứ tự: có test đỏ trước rồi mới code.
- **Bảng việc báo tin cho Điều phối** (mục 6.9): Điều phối không ngồi chờ từng người, nên làn nào xong là được giao bước tiếp ngay.
- **Việc nhỏ trước** khi chọn việc cho làn trống (mục 7.1): làn được giải phóng sớm hơn.
- **Trinh sát** cho việc Vừa và Lớn (mục 7.6): DEV Opus bắt tay vào làm ngay thay vì tự mò code.

### 7.6 Trinh sát (Information Retriever)

Trinh sát là vai gom bối cảnh cho việc Vừa và Lớn trước khi ai bắt tay vào làm. Nó không phải thành viên cố định, mà là một phiên con ngắn cho từng phiếu.

1. Việc bắt đầu (sau bước Bạn duyệt phiếu, nếu đường có bước đó): Điều phối ghi `step: ts` và mở trinh sát: Claude Sonnet, effort medium, chạy trong thư mục dự án, tên `<phòng ban>-ts-<mã>`.
2. Bảng việc tự gửi phiếu cho trinh sát. Trinh sát bắt đầu ngay, không chờ Điều phối.
3. Trinh sát chỉ đọc repo, rồi ghi `teams\<phòng ban>\context\<mã>.md` với các mục: File liên quan (file:dòng, vì sao), Mẫu có sẵn, Test và lệnh chạy, Bẫy và rủi ro. Tối đa khoảng 80 dòng.
4. Nó ghi báo cáo bàn giao. Bảng việc báo cho Điều phối (mục 6.9).
5. Điều phối đóng trinh sát, giao bước tiếp, và dặn DEV, QA đọc file bối cảnh trước khi làm.

Trên Bảng việc:

- Ô làn hiện nhãn **TS** khi trinh sát đang chạy. Bấm để xem nó làm gì.
- Phiếu có mục **Bối cảnh** (nhãn Trinh sát) hiện nội dung file bối cảnh, ngay dưới nội dung phiếu.

Vì sao đáng: trinh sát tốn khoảng 2–3 phút Sonnet. Đổi lại, DEV Opus xhigh (đắt nhất) không phải tự đi tìm code, context của DEV đỡ đầy, và ít làm sai chỗ hơn. Việc nhỏ đã rõ phạm vi nên bỏ qua bước này.

Trinh sát ghi file riêng chứ không chèn vào phiếu, vì Điều phối sửa phiếu liên tục: hai agent cùng sửa một file dễ ghi đè nhau.

## 8. Cách dùng hiệu quả nhất

### 8.1 Chọn đúng cách làm cho từng việc

| Việc | Cách làm | Vì sao |
|---|---|---|
| Hỏi nhanh, sửa một chỗ, việc rõ ràng | Một phiên Claude (**Phiên mới**), không phòng ban | Phòng ban dùng 4 phiên và thêm bước bàn giao; việc nhỏ không đáng |
| Một tính năng hoặc lỗi cần chắc chắn | Phòng ban, nhịp Chuẩn, 1 làn | QA test tái hiện và Review bắt lỗi trước khi bạn duyệt |
| Nhiều việc độc lập, không sửa chung file | Phòng ban, 2–3 làn, nhịp Nhanh hoặc Chuẩn | Các làn chạy song song trong worktree riêng |
| Việc rủi ro: bảo mật, dữ liệu, thanh toán | Nhịp Kỹ, 1 làn | Có kế hoạch được duyệt trước khi code, thêm Review vòng 2 |
| Tìm hiểu code, so sánh hướng làm | Mẫu Nghiên cứu, hoặc một phiếu nghiên cứu | Chỉ đọc, không đụng repo |
| Muốn so hai cách giải | Mẫu Hai hướng | Hai DEV khác loại agent, Review so sánh |
| Hết quota Codex | Mẫu Toàn Claude hoặc Tiết kiệm | Không gọi Codex |

### 8.2 Viết phiếu tốt

Phiếu tốt là cách rẻ nhất để agent làm đúng ngay vòng đầu.

- **Một phiếu một việc.** Việc lớn nên tách thành vài phiếu Vừa; chúng chạy được song song trên nhiều làn.
- **Mục tiêu** viết theo kết quả thấy được ("trang X hiện Y khi Z"), không viết theo cách làm.
- **Phạm vi** liệt kê file được sửa. Điều phối dừng giao việc khi thấy file ngoài phạm vi bị sửa.
- **Tiêu chí xong** là các ô `- [ ]` kiểm được. Thẻ hiện "k/n tiêu chí".
- Đặt cỡ đúng: sai cỡ làm việc đi đường quá dài (tốn) hoặc quá ngắn (sót lỗi).

### 8.3 Nhịp làm việc hằng ngày

1. Mở dự án: `ha <tên>` (mục 2).
2. Mở Bảng việc. Xem cột Chờ bạn duyệt và các banner câu hỏi trước tiên.
3. Trả lời các câu hỏi đang chờ: **Ctrl+Shift+Space** mở **Cần bạn**. Agent đang chờ bạn là agent đang đứng yên.
4. Duyệt các phiếu đã xong, đọc báo cáo bàn giao trước khi bấm.
5. Thêm việc mới bằng **Việc mới**. Chỉnh số làn theo số việc độc lập đang chờ.
6. Trong lúc chờ, làm việc khác. Âm báo và thông báo sẽ gọi bạn khi agent cần.
7. Cuối ngày: xem chip chi phí, dọn worktree của làn đã duyệt.

### 8.4 Mẹo tăng tốc và độ chính xác

- Ghi các quyết định chung (quy ước, thứ không được đụng) vào NOTES.md (biểu tượng sổ). Điều phối đọc file này.
- Đọc **Báo cáo bàn giao** thay vì đọc màn hình agent: báo cáo có kết quả test thật, file đổi, rủi ro.
- Thẻ hiện ✗ hoặc "cần bạn quyết": đọc báo cáo rồi quyết luôn. Phòng ban đứng yên cho tới khi bạn trả lời.
- Sau khi cập nhật Herdr hoặc đổi luật: **⋯ → Gửi lại lời dặn cho cả đội**, hoặc bấm lại nhịp/làn đang chọn.
- Chuyển kết quả giữa hai agent: menu **+** → **Chèn câu trả lời của agent…** (mục 4.3).
- Việc phụ không cần pane: gõ task rồi **Ctrl+Enter** để tạo phiên con (mục 4.3).
- Context của Điều phối đầy dần sau nhiều việc. Khi chip context của nó vượt khoảng 70%, chọn Điều phối ở chip nơi nhận rồi bấm **Compact phiên**.
- Hàng chờ ở cột Kiểm tra dài là dấu hiệu Review đang nghẽn: chuyển **⋯ → Kiểm tra ở làn phụ → QA + Review riêng**, hoặc giảm số làn (mục 7.5).
- Nên để tab Bảng việc mở khi phòng ban đang chạy: nó là tín hiệu thứ hai gọi Điều phối dậy (mục 6.9). Đóng tab thì mở lại là nó báo bù.

## 9. Ngôn ngữ và cài đặt

**Ngôn ngữ giao diện**: dòng **Ngôn ngữ** ở chân sidebar, bấm **VI** hoặc **EN**. Mọi mod tùy biến đổi theo ngay. Khi sidebar thu thành dải icon, bấm biểu tượng ngôn ngữ để đổi qua lại.

- Lời dặn, phiếu việc và tin gửi cho agent luôn bằng tiếng Việt, dù giao diện là tiếng Anh.
- Màn hình riêng của Herdr (Cài đặt, bảng lệnh, thông báo "Claude Code finished") và giao diện terminal của từng agent không đổi theo.

**Cài đặt** (Ctrl+, hoặc dòng **Cài đặt**): giao diện màu, âm báo, cập nhật, máy SSH, quyền riêng tư.

**Cỡ chữ cả app**: **Ctrl+=** to hơn, **Ctrl+-** nhỏ hơn, **Ctrl+0** về mặc định.

**Câu lệnh riêng**: menu **Thao tác → Sửa action của tôi…** (mục 4.3).

**Danh sách dự án**: `projects.json` (mục 13). Thêm thư mục gốc bằng **Mở dự án → Thêm thư mục gốc vào danh sách…**.

## 10. Phím tắt

Bảng đầy đủ luôn khớp cấu hình hiện tại: nhấn **F1**, gõ để lọc. Các phím hay dùng:

| Phím | Việc |
|---|---|
| Ctrl+Shift+N | Phiên mới |
| Ctrl+Shift+J | Mở dự án |
| Ctrl+Shift+Space | Cần bạn |
| Ctrl+Shift+D | Phòng ban |
| Ctrl+Shift+I | Vào ô nhập khung chat |
| Enter / Shift+Enter / Ctrl+Enter | Gửi / xuống dòng / gửi thành phiên con (trong khung chat) |
| Alt+V | Dán ảnh vào khung chat |
| Ctrl+Shift+R | Bật/tắt rail |
| Ctrl+Shift+B | Bật/tắt sidebar |
| Ctrl+Shift+K | Tìm tab / agent |
| Ctrl+Shift+P | Bảng lệnh |
| F1 | Bảng phím tắt |
| Ctrl+, | Cài đặt |
| Alt+1…9 | Tới space thứ N |
| Ctrl+1…9 | Tới tab thứ N |
| Ctrl+Tab / Ctrl+Shift+Tab | Tab kế / tab trước |
| Ctrl+Shift+PageDown / PageUp | Space kế / space trước |
| Alt+↓ / Alt+↑ | Agent kế / agent trước |
| Ctrl+Shift+T / Ctrl+Shift+W | Tab mới / đóng tab |
| Ctrl+Shift+O / Ctrl+Shift+E | Tách pane phải / xuống (agent cùng loại) |
| Ctrl+Shift+X / Ctrl+Shift+Z | Đóng pane / phóng to pane |
| Alt+H/J/K/L hoặc Alt+←/→ | Sang pane bên cạnh |
| Alt+Shift+H/J/K/L | Đổi chỗ pane |
| F2 / Shift+F2 | Đổi tên tab / space |
| Ctrl+Shift+L | Đổi layout |
| Ctrl+Shift+C / Ctrl+Shift+V | Sao chép / dán trong terminal |
| Ctrl+V | Dán ảnh hoặc chữ vào terminal |
| Ctrl+Shift+F | Tìm trong terminal |

Trong Claude Code: **Esc** ngắt, **Esc Esc** tua lại, **Shift+Tab** đổi chế độ quyền, **/** lệnh slash, **!** chạy lệnh shell, **#** ghi vào memory, **@** nhắc file, **↑** lịch sử tin, **Ctrl+R** tìm lịch sử.

Trong hộp Cần bạn: **1–9** chọn, **↑/↓** đổi agent, **Esc** đóng. Trên Bảng việc: **Enter** gửi thanh nhập, **Esc** đóng phiếu hoặc thanh nhập.

## 11. An toàn

**Chế độ quyền của Claude**: mặc định là **Tự động** (`defaultMode: auto` trong `~\.claude\settings.json`). Claude tự quyết lúc nào hỏi, các luật `deny` trong settings vẫn chặn tuyệt đối. **Bỏ qua quyền** nhận mọi thao tác không hỏi: chỉ dùng cho việc ngắn, trong thư mục bạn chấp nhận rủi ro.

**Tin tưởng thư mục**: mỗi repo mới, Claude, Codex và Antigravity hỏi có tin tưởng thư mục không. Câu hỏi này chỉ một lần mỗi thư mục. Trả lời Có là để agent đọc cấu hình của repo (CLAUDE.md, AGENTS.md, hooks). Với repo lạ, đọc hooks và cấu hình trước khi tin.

- Nút **Tin tưởng** trên Bảng việc và hộp tạo phòng ban chỉ trả lời câu hỏi tin tưởng thư mục. Màn duyệt hooks của Codex (hooks chạy ngoài sandbox) phải tự trả lời trong pane.

**Agent tự động trong phòng ban**: Codex và Antigravity chạy không hỏi ai. Bù lại:

- Điều phối chạy `git status` và `git diff --stat` sau mỗi bước của đồng đội.
- Thấy file ngoài phạm vi, file bị xoá, hoặc đồng đội tự commit/push/reset/clean, Điều phối dừng giao việc và báo bạn. Nó không tự hoàn tác.
- Codex làm Review chạy chỉ đọc.
- Commit và PR chỉ sau khi bạn bấm **Duyệt**. Không merge, deploy, push nhánh chính.

**Commit thủ công**: ô Commit của tab **Thay đổi** commit mọi file đang đổi (`git add -A`). Kiểm tra danh sách file trước khi bấm.

## 12. Xử lý sự cố

| Hiện tượng | Nguyên nhân | Cách xử lý |
|---|---|---|
| Bấm Duyệt / Sửa thêm / Việc mới thì bảng mở pane Điều phối, báo "Điều phối đang hỏi bạn…" | Điều phối đang chờ bạn trả lời một câu hỏi | Trả lời trong pane, rồi bấm lại |
| "Điều phối đã thoát: tạo lại phòng ban ở menu ⋯" | Pane Điều phối đã tắt | **⋯ → Tạo phòng ban khác…** ở cùng space |
| Thành viên kẹt ở "hỏi tin tưởng thư mục" | Câu hỏi tin tưởng của agent | Bấm **Tin tưởng**, hoặc **Xem** rồi trả lời trong pane |
| Codex đã nhận chữ nhưng không chạy | Codex trên Windows giữ tin vừa dán trong ô nhập | Nhấn Enter trong pane Codex. Bảng việc và Điều phối đã tự gửi thêm Enter |
| Agent đang làm mà bảng không thay đổi | Điều phối chưa ghi lại phiếu | Nhắn `@lead cập nhật phiếu T-n`. Bảng tự đọc lại thư mục phiếu |
| Thành viên mới không biết luật mới (làn, nhịp, báo cáo bàn giao) | Phòng ban tạo trước khi có luật | **⋯ → Gửi lại lời dặn cho cả đội**, hoặc bấm lại nhịp/làn đang chọn |
| Việc đứng ở "chờ làn trống" lâu | Đã hết làn | Tăng số làn, hoặc đánh dấu gấp việc cần làm trước |
| Đồng đội đã xong mà Điều phối đứng yên | Tab Bảng việc đang đóng, hoặc Điều phối còn lời dặn cũ | Mở lại Bảng việc (nó báo bù); **⋯ → Gửi lại lời dặn cho cả đội** lúc các việc đang ở điểm dừng |
| Nhiều việc xếp hàng ở cột Kiểm tra | Review dùng chung bị nghẽn | **⋯ → Kiểm tra ở làn phụ → QA + Review riêng** (mục 7.5) |
| Thẻ ghi "cần bạn quyết" | Sửa 2 vòng vẫn chưa đạt | Đọc báo cáo bàn giao, nhắn Điều phối hướng đi |
| Hộp Cần bạn hiện "Đang đọc câu hỏi…" mãi | Câu hỏi không phải dạng lựa chọn của Claude Code | Bấm **Mở pane**, trả lời trong terminal |
| "Câu hỏi đã thay đổi — Chưa gửi gì" | Agent đã đổi câu hỏi trước khi bạn chọn | Đọc câu hỏi mới rồi chọn lại |
| Chip model/context không hiện | Agent nhận tin không phải Claude Code, hoặc Claude chưa trả lời lần nào | Gửi một tin cho Claude, chip cập nhật sau vài giây |
| Không đổi được chế độ quyền | Claude đang mở hộp thoại, hoặc chế độ chưa bật trong phiên | Nhấn Esc trong pane; "Bỏ qua quyền" cần phiên được mở với quyền đó |
| Sidebar chỉ hiện vài space | Đang có phạm vi do `ha` đặt | Bấm **×** trên chip phạm vi, hoặc `ha -All` |
| Bố cục cửa sổ hỏng sau khi chỉnh | Layout hoặc phím lỗi | **Ctrl+Alt+Shift+Esc** đưa về layout mặc định; xem lỗi bằng `herdr-app status` |
| Sau khi khởi động lại máy, pane chỉ còn shell (`$`) | herdr-core giữ terminal nhưng không chạy lại agent | Claude: khung chat tự mở lại (mục 4.3). Codex/Antigravity trong phòng ban: nút **Khởi động lại** trên Bảng việc (mục 6.2) |
| Terminal hiện `bash: [200~claude: command not found` | Lệnh dán bị hỏng mã (bản cũ) | Bản hiện tại gõ từng phím và tự thử lại; vẫn còn thì gõ tay `claude --resume <phiên>` |
| Mod hiện lỗi đỏ | File mod lỗi cú pháp | `herdr-app status` xem lỗi; app giữ bản chạy được gần nhất |

## 13. Phụ lục: file và thư mục

| Đường dẫn | Chứa gì |
|---|---|
| `~\.config\herdr-app\` | Toàn bộ giao diện app: layout, phím, mod |
| `~\.config\herdr-app\layouts\desktop.json` | Layout kiểu Claude Desktop đang dùng |
| `~\.config\herdr-app\keys.json` | Phím tắt |
| `~\.config\herdr-app\mods\` | Các mod; mod tùy biến: `desktop-*`, `composer`, `needs-you`, `new-session`, `projects`, `hotkeys`, `team` |
| `~\.config\herdr-app\projects.json` | Thư mục gốc, nhóm và dự án đã lưu |
| `~\.config\herdr-app\actions.json` | Câu lệnh riêng của menu Thao tác |
| `~\.config\herdr-app\teams\<tên>\tasks\T-n.md` | Phiếu việc của phòng ban |
| `~\.config\herdr-app\teams\<tên>\handoff\<mã>-<vai>.md` | Báo cáo bàn giao |
| `~\.config\herdr-app\teams\<tên>\research\<mã>.md` | Kết quả nghiên cứu |
| `~\.config\herdr-app\teams\<tên>\context\<mã>.md` | Bối cảnh trinh sát gom cho việc |
| `~\.config\herdr-app\teams\<tên>\NOTES.md` | Quyết định chung của phòng ban |
| `<thư mục cha của dự án>\_wt\<tên>-<mã>` | Worktree của các làn phụ |
| `~\.config\herdr-app\bin\ha.ps1` | Lệnh `ha` |
| `~\.config\herdr-app\docs\` | Tài liệu thiết kế, tiến độ, hướng dẫn này |
| `%LOCALAPPDATA%\herdr-claude\<địa chỉ>.json` | Số liệu status line của từng phiên Claude (context, chi phí, giới hạn) |

Phiếu việc có front matter giữa hai dòng `---`:

| Trường | Giá trị |
|---|---|
| id | T-1, T-2… |
| title | Tên việc |
| status | cho · dang-lam · kiem-tra · cho-duyet · xong |
| owner | Vai đang giữ việc (lead, dev, qa, review…); nhiều vai cách nhau dấu phẩy |
| note | Một dòng kết quả mới nhất |
| size | nho · vua · lon |
| step | Bước hiện tại trên đường đi |
| priority | cao (thẻ Gấp) |
| branch, worktree | Nhánh và worktree của làn |
| conflict | Việc khác trùng file |

Sau front matter là các mục `## Mục tiêu`, `## Phạm vi`, `## Tiêu chí xong`, `## Rủi ro`, `## Nhật ký`. Bạn sửa tay được, nhưng nên nhờ Điều phối để nhật ký đầy đủ.
