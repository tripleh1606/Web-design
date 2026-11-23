# SeaweedFS S3: triển khai và tích hợp

Cấu hình trong `infra/seaweedfs/` chạy một master, volume server, filer và S3 gateway trong một container. `/data` là Docker named volume chứa cả volume data, master metadata và LevelDB2 của filer; `filer.toml` được mount read-only. Đây là cấu hình một máy cho phát triển/triển khai nhỏ, không phải HA hay backup; mất host hoặc volume có thể mất dữ liệu. Chỉ S3 port 8333 được publish trên loopback host; không mở master, volume hay filer ra mạng công cộng. Image được ghim ở `chrislusf/seaweedfs:4.53`.

## Tạo credential và khởi động

Cần Docker Compose, Python 3 và AWS CLI. Ví dụ tạo hai identity ngẫu nhiên ở **ngoài repository**, với quyền file chỉ cho user hiện tại. Không commit, gửi browser, đưa vào log hoặc chia sẻ file này. Identity `bootstrap` có quyền quản trị để tạo bucket; `gallery` chỉ có Read/Write/List cho bucket `gallery-photos`, không có Admin hay anonymous identity. Write bao gồm PUT và DELETE; quyền theo bucket không cách ly riêng prefix. Dành riêng bucket này cho ứng dụng và không thêm bucket policy public. Lệnh dưới sẽ từ chối ghi đè file hiện có.

Chạy các lệnh từ thư mục gốc repository; cần Docker Engine đang chạy, plugin `docker compose`, Python 3 và AWS CLI (`docker compose version`, `python3 --version`, `aws --version`). Cổng loopback 8333 phải còn trống. Compose đọc `SEAWEED_S3_CONFIG` từ shell mỗi lần chạy, kể cả khi xem log hoặc dừng dịch vụ; export lại đường dẫn nếu mở shell mới. Kiểm tra thư mục cấu hình là của user tin cậy và không dùng chung tài khoản.

```sh
mkdir -p "$HOME/.config/gallery-seaweedfs"
chmod 700 "$HOME/.config/gallery-seaweedfs"
export SEAWEED_S3_CONFIG="$HOME/.config/gallery-seaweedfs/s3.json"
export AWS_SHARED_CREDENTIALS_FILE="$HOME/.config/gallery-seaweedfs/credentials"
python3 - <<'PY'
import json, os, secrets
from pathlib import Path

config = Path(os.environ['SEAWEED_S3_CONFIG'])
credentials = Path(os.environ['AWS_SHARED_CREDENTIALS_FILE'])
# Refuse to overwrite either file, including after a partial previous setup.
if config.exists() or credentials.exists():
    raise SystemExit('Credential files already exist; back them up or choose a new directory')
os.umask(0o077)
admin = (secrets.token_hex(10), secrets.token_hex(20))
app = (secrets.token_hex(10), secrets.token_hex(20))
identities = [
    {'name': 'bootstrap', 'credentials': [{'accessKey': admin[0], 'secretKey': admin[1]}],
     'actions': ['Admin', 'Read', 'Write', 'List']},
    {'name': 'gallery', 'credentials': [{'accessKey': app[0], 'secretKey': app[1]}],
     'actions': ['Read:gallery-photos', 'Write:gallery-photos', 'List:gallery-photos']},
]
with config.open('x') as f:
    json.dump({'identities': identities}, f, indent=2)
with credentials.open('x') as f:
    for name, (access, secret) in [('bootstrap', admin), ('gallery', app)]:
        f.write(f'[{name}]\naws_access_key_id = {access}\naws_secret_access_key = {secret}\n')
PY

docker compose -f infra/seaweedfs/compose.yaml up -d
# Khi gateway đã sẵn sàng, tạo bucket một lần bằng identity quản trị:
AWS_PROFILE=bootstrap AWS_DEFAULT_REGION=us-east-1 aws --endpoint-url http://127.0.0.1:8333 s3api create-bucket --bucket gallery-photos
```

Nếu bucket đã tồn tại, không tạo lại hoặc xóa dữ liệu; kiểm tra bằng `head-bucket`. Nếu gateway chưa sẵn sàng, xem `docker compose -f infra/seaweedfs/compose.yaml logs seaweedfs` rồi thử lại. Cất credential bootstrap riêng và không cấp cho backend; hạn chế quyền đọc file credential, xoay credential khi lộ. Sau khi sửa file S3 config, restart container để nạp lại. Không dùng `docker compose down -v` nếu muốn giữ dữ liệu.

Kiểm tra bucket bằng `AWS_PROFILE=bootstrap AWS_DEFAULT_REGION=us-east-1 aws --endpoint-url http://127.0.0.1:8333 s3api head-bucket --bucket gallery-photos`. Lỗi cũng có thể do gateway chưa sẵn sàng hoặc sai quyền, không tự suy ra bucket đã tồn tại. Kiểm tra cấu hình đã resolve mà không in nội dung secret bằng `docker compose -f infra/seaweedfs/compose.yaml config --quiet`.

Khi ngừng dịch vụ, dùng `docker compose -f infra/seaweedfs/compose.yaml down` (không có `-v`); named volume vẫn tồn tại và `up -d` sẽ dùng lại. `restart` hoặc `down` không phải backup; xóa volume sẽ xóa dữ liệu. Đường dẫn secret phải vẫn tồn tại khi khởi động lại.

## Kiểm tra độc lập bằng `weed mini`

Đã kiểm tra riêng SeaweedFS **4.54** trên macOS với `weed mini`, thư mục dữ liệu tạm mới và các cổng loopback riêng; kết quả này không chứng minh cấu hình Docker image 4.53 ở trên. Dùng file `-s3.config` với identity có quyền Admin/Read/Write/List và `-bucket=gallery-test`, adapter đã PUT, HEAD và GET đúng bytes, length và `image/webp`; GET nặc danh trên object hiện hữu trả 403. Sau khi dừng và khởi động lại `weed mini` với cùng thư mục, GET vẫn trả đúng bytes; DELETE thành công và HEAD sau đó trả 404. Với SQLite thực và Node 22, lifecycle publish, media handler (body, Content-Type, Content-Length, ETag, Cache-Control) và lifecycle delete cũng chạy thành công. Đây là kiểm tra module trực tiếp, không phải kiểm tra route HTTP ứng dụng.

Một lần kiểm tra riêng khác với 4.54 xác nhận `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` và `S3_BUCKET` được `weed mini` nhận: PUT đã ký thành công, GET nặc danh trên object hiện hữu trả 403 và request ký bằng credential sai trả 403. Không vì thế mặc định mọi phiên bản hoặc cấu hình đều an toàn: luôn kiểm tra anonymous access trên object thật và hạn chế tất cả cổng nội bộ vào loopback. Không dùng credential ví dụ cho môi trường thật.

## Hợp đồng kết nối backend

- Endpoint từ backend chạy trên host: `http://127.0.0.1:8333`; region ký request `us-east-1`; bucket `gallery-photos`; path-style **true**. Nếu backend ở container khác, loopback trỏ vào chính container đó: cần đưa hai service vào mạng Docker riêng, dùng tên service/endpoint phù hợp và không publish các cổng nội bộ ra ngoài.
- HTTP ở đây chỉ dành cho cùng máy/mạng tin cậy. Với lưu lượng qua mạng không tin cậy, dùng HTTPS với chứng chỉ hợp lệ và xác thực gateway/reverse proxy; cấu hình endpoint `https://...`, xác minh CA/hostname và hạn chế network access. Không tắt kiểm tra TLS. Không đưa S3 endpoint hay credential cho browser.
- `api/src/storage/s3.js` export `createS3Storage({ endpoint, region, bucket, forcePathStyle, credentials: { accessKeyId, secretAccessKey } })`; backend phải tự lấy cấu hình bí mật từ môi trường/secret manager. Module không tự đọc biến môi trường. Nó cần `@aws-sdk/client-s3` và trả `put(key, variant)` (`variant.path`, `variant.bytes`), `get(key)`, `head(key)`, `delete(key)`, `close()`. `get`/`head` trả metadata length, etag, contentType; `get` thêm stream body. Bucket phải được tạo trước. Không fallback sang local storage khi gateway lỗi.
- Storage key do server tạo, dự kiến `photos/<photoId>/<width>.webp`; không dùng filename, key hoặc đường dẫn tùy ý từ client. Không ghi đè key/URL đã công bố. Backend kiểm tra Photo đã công bố trong DB trước khi stream media, đặt WebP, length/ETag thực và cache immutable chỉ cho response thành công. Xóa origin không thu hồi bản đã tải hoặc còn trong cache.

Ví dụ cấp cấu hình cho tiến trình backend chạy trên host, trong shell riêng và không bật `set -x`. Các biến này chỉ là input cho đoạn wiring minh họa bên dưới, **không** tự kích hoạt backend hay được module storage tự đọc:

```sh
export S3_ENDPOINT=http://127.0.0.1:8333
export S3_ACCESS_KEY_ID="$(aws configure get aws_access_key_id --profile gallery)"
export S3_SECRET_ACCESS_KEY="$(aws configure get aws_secret_access_key --profile gallery)"
export GALLERY_DB_PATH="$HOME/.local/share/gallery/gallery.sqlite"
mkdir -p "$(dirname "$GALLERY_DB_PATH")"
```

Lệnh `aws configure get` dùng `AWS_SHARED_CREDENTIALS_FILE` đã export ở trên; kiểm tra biến đó khi mở shell mới. Không in hoặc commit các biến bí mật; môi trường tiến trình có thể bị đọc bởi user/process có quyền, nên production cần secret manager và phân quyền phù hợp. Chạy tiến trình backend từ shell này sau khi ứng dụng đã triển khai wiring; khi xong có thể `unset S3_ACCESS_KEY_ID S3_SECRET_ACCESS_KEY`.

`api/src/storage/sqlite-repository.js` export `createSqliteRepository(absoluteDbPath)` (Node >= 22.13). File DB phải là đường dẫn tuyệt đối, persistent; DB và file khóa `<đường dẫn DB canonical>.lock` phải trên filesystem local bền vững. Mọi process phải chạy trên cùng host và dùng cùng DB canonical **và cùng file khóa**; không dùng bản sao, đường dẫn lock khác, filesystem chia sẻ đa host, hay truy cập bảng/object ngoài protocol. Không xóa, thay thế hoặc di chuyển file lock khi process đang chạy.

Repository dùng WAL, `synchronous=FULL`, foreign key và timeout 5 giây. `withLock(fn)` giữ transaction `BEGIN IMMEDIATE` trên **database lock riêng** đến khi callback hoàn tất; khóa giải phóng khi process chết, không có lease hoặc cơ chế cướp khóa. Transaction lock không atomic với DB dữ liệu hay S3: manifest commit trước PUT; insert Photo cùng toàn bộ variant là một transaction DB; ẩn Photo cùng tạo delete job là một transaction khác; hoàn tất delete xóa metadata ẩn và job trong một transaction. Không bao giờ giữ một transaction DB xuyên qua S3 để giả định atomicity. Mọi publish, delete và recovery phải dùng cùng lock; media giữ lock khi tìm variant đã công bố, lấy object và kiểm tra metadata, rồi giải phóng trước khi stream response. Truy cập bỏ qua lock phá vỡ bảo đảm; tranh chấp lock có thể thất bại sau 5 giây.

Media giả định stream S3 đã lấy vẫn đọc được sau khi object bị xóa đồng thời. Hành vi này chưa được xác minh trực tiếp với SeaweedFS; cần kiểm tra với triển khai thực tế trước khi dựa vào giả định này. Nếu stream lỗi sau khi response bắt đầu, kết nối bị hủy; xóa object không thu hồi bytes đã gửi hoặc cache.

`createStorageLifecycle({ repository, storage })` từ `api/src/storage/lifecycle.js` cung cấp:

- `await lifecycle.publish(photo, variants)` trả UUID photo do server tạo. `photo` cần `title`, `alt`, `width`, `height`; mỗi variant cần `width`, `height`, `bytes` là số nguyên dương an toàn, `mime: 'image/webp'`, `path` là đường dẫn file WebP server đã chuẩn bị; width không trùng và danh sách không rỗng. Lifecycle tạo key `photos/<uuid>/<width>.webp`, ghi manifest trước PUT, chỉ công bố sau khi PUT đủ. Caller quản lý file tạm và kiểm tra/ủy quyền input; không tái sử dụng ID hoặc key, kể cả sau xóa.
- `await lifecycle.deletePhoto(id)` trả `{ found, pending }`: không có photo/job là `{ found: false, pending: false }`; cleanup thất bại giữ job và trả `pending: true`. Caller phải xác thực và phân quyền trước khi gọi.
- `await lifecycle.recover()` trả mảng `{ id, error }` cho các job cleanup lỗi; lỗi lấy lock hoặc liệt kê job có thể làm promise reject. Recovery kiểm tra DB trước khi xóa: upload đã công bố chỉ xóa manifest; delete của photo vẫn công bố không bị xóa và job còn lại. Retry các job còn tồn đọng, không chỉ các lỗi trong mảng trả về.

`createMediaHandler({ repository, storage })` từ `api/src/media/stream.js` là handler kiểu Express cho `GET /media/:id/:width.webp`; chỉ stream variant đã công bố, kiểm tra metadata object, trả 404 khi ID/width không hợp lệ hoặc variant không tồn tại, 503 khi storage/lock lỗi trước khi gửi response. Response thành công có WebP, length, ETag và cache immutable; lỗi dùng `no-store`. Nếu stream đã bắt đầu mà lỗi, kết nối bị hủy.

Ví dụ tích hợp **minh họa**, không phải entrypoint hoặc route hiện có; ứng dụng phải tự cung cấp Express, biến cấu hình, upload đã xử lý và auth:

```js
import { createSqliteRepository } from './storage/sqlite-repository.js';
import { createS3Storage } from './storage/s3.js';
import { createStorageLifecycle } from './storage/lifecycle.js';
import { createMediaHandler } from './media/stream.js';

const repository = createSqliteRepository(process.env.GALLERY_DB_PATH); // absolute path
const storage = createS3Storage({
  endpoint: process.env.S3_ENDPOINT, region: 'us-east-1',
  bucket: 'gallery-photos', forcePathStyle: true,
  credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY },
});
const lifecycle = createStorageLifecycle({ repository, storage });
const failures = await lifecycle.recover(); // before accepting traffic
if (failures.length) throw new Error(`Recovery failed for ${failures.length} jobs`);
// app.get('/media/:id/:width.webp', createMediaHandler({ repository, storage }));
// After authentication, authorization and image processing:
// const id = await lifecycle.publish({ title, alt, width, height }, [{ width, height, bytes, mime: 'image/webp', path }]);
// const result = await lifecycle.deletePhoto(id); // handle result.pending
// On shutdown after requests/jobs drain: storage.close(); repository.close();
```

**Tích hợp ứng dụng chưa hoàn tất:** chưa có wiring khởi động, route upload/delete/media, xác thực hoặc worker recovery được nối với các module này. Backend phải cung cấp chúng, chạy recovery trước traffic, xử lý lỗi và retry job tồn đọng bằng cùng repository/lock. Không giả định các route hay lệnh worker đã tồn tại; duy trì một cơ chế manifest/cleanup duy nhất.

**Giới hạn PUT hoàn tất muộn:** nếu PUT báo lỗi hoặc process chết trong khi request vẫn đang được gateway xử lý, cleanup có thể DELETE trước khi PUT đó hoàn tất; object có thể xuất hiện lại sau cleanup, kể cả khi manifest đã bị xóa. Lock SQLite không điều khiển request đã rời process và recovery không bảo đảm phát hiện orphan này. Không tái sử dụng key; vận hành cần đối chiếu object với DB sau khi các request cũ chắc chắn đã kết thúc, và chỉ xử lý orphan với quy trình an toàn khi mọi writer đã dừng. Không coi recovery là bảo đảm không có orphan.

## Kiểm tra object và phục hồi

Các lệnh chỉ dùng trên host có credential ở trên; thay `PHOTO_ID` và `WIDTH` bằng giá trị thực lấy từ DB, không từ input không tin cậy. Chỉ dùng profile `gallery` cho các thao tác object. Không đăng output có credential hoặc metadata nội bộ nhạy cảm.

```sh
export AWS_DEFAULT_REGION=us-east-1
export AWS_PROFILE=gallery
aws --endpoint-url http://127.0.0.1:8333 s3api list-objects-v2 --bucket gallery-photos --prefix photos/
aws --endpoint-url http://127.0.0.1:8333 s3api head-object --bucket gallery-photos --key "photos/PHOTO_ID/WIDTH.webp"
# Một object thực không được đọc nặc danh (mong đợi 403, không phải bytes ảnh):
curl -i http://127.0.0.1:8333/gallery-photos/photos/PHOTO_ID/WIDTH.webp
```

Đối chiếu object/HEAD với PhotoVariant trong DB và response media của ứng dụng; kiểm tra PUT, GET, HEAD, DELETE bằng object thử riêng rồi xóa nó. Sau restart `docker compose -f infra/seaweedfs/compose.yaml restart`, xác nhận cùng object và DB vẫn đọc được. Các bước này là hướng dẫn, không phải bằng chứng đã chạy.

Để kiểm tra độc lập gateway trước khi có route ứng dụng, tạo object thử riêng bằng profile `gallery`, đọc lại, so sánh rồi xóa (không dùng key của ảnh thật). Chạy từng lệnh và dừng ngay nếu lệnh lỗi; `cmp` không in gì khi nội dung khớp:

```sh
export AWS_PROFILE=gallery AWS_DEFAULT_REGION=us-east-1
tmpdir="$(mktemp -d)"
printf 'storage-check\n' > "$tmpdir/input"
key="setup-check/$(python3 -c 'import uuid; print(uuid.uuid4())')"
aws --endpoint-url http://127.0.0.1:8333 s3api put-object --bucket gallery-photos --key "$key" --body "$tmpdir/input"
aws --endpoint-url http://127.0.0.1:8333 s3api head-object --bucket gallery-photos --key "$key"
aws --endpoint-url http://127.0.0.1:8333 s3api get-object --bucket gallery-photos --key "$key" "$tmpdir/output"
cmp "$tmpdir/input" "$tmpdir/output"
aws --endpoint-url http://127.0.0.1:8333 s3api delete-object --bucket gallery-photos --key "$key"
rm -r "$tmpdir"
```

Nếu lệnh bị lỗi hoặc gián đoạn, kiểm tra lỗi trước khi tiếp tục; xóa object thử bằng cùng lệnh `delete-object` và key đã tạo, rồi xóa thư mục tạm. Kiểm tra riêng quyền truy cập nặc danh với một object thật đang tồn tại như trên; không coi lỗi kết nối hay object không tồn tại là bằng chứng bucket riêng tư. Quyền truy cập được giới hạn bởi cấu hình gateway và mạng, không phải mã hóa dữ liệu lưu trên volume; bảo vệ host, bản sao lưu và quyền Docker. Lệnh kiểm tra này không chứng minh quyền riêng tư của mọi object hoặc policy.


Khi storage lỗi, giữ nguyên DB và manifest, khôi phục gateway/volume, sau đó chạy recovery do backend cung cấp; kiểm tra job còn pending và log lỗi, không xóa thủ công chỉ vì object trông mồ côi. Với backup, dừng ghi và quiesce ứng dụng/worker, dừng SeaweedFS, sao lưu nhất quán named volume **cùng** database ứng dụng và cấu hình cần thiết; bảo vệ riêng credential. Khôi phục các bản cùng thời điểm, khởi động storage và DB trước backend/recovery, đối chiếu object với DB trước khi nhận ghi. Snapshot không đồng bộ DB và storage có thể tạo orphan hoặc thiếu object; recovery không thể tự tạo lại bytes đã mất. Không xóa volume hoặc manifest để xử lý lỗi.
