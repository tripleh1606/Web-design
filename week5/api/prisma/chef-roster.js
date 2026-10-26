// User-provided roster. In this particular source list, one given-name token
// precedes the family/middle tokens; move that first token to the end.
const sourceNames = [
  'Hải Đinh Viết',
  'Phúc Đoàn Hồng',
  'Tuấn Đoàn Minh',
  'Lâm Đoàn Võ Ngọc',
  'Hoàng Hồ Sĩ',
  'Hiệp Hoàng Hữu',
  'Huy Hoàng Minh',
  'Thư Huỳnh Anh',
  'Hưng Hy Huê',
  'Lộc Khả Phước',
  'Bảo Lê Nguyễn Quốc',
  'Quang Lê Trần Lam',
  'Băng Mai Khánh',
  'Hoàng Mai Nhật',
  'Thắm Ngô Huỳnh',
  'Thông Nguyễn Cao',
  'Khôi Nguyễn Đăng',
  'Long Nguyễn Hoàng',
  'Minh Nguyễn Hữu Nhật',
  'Anh Nguyễn Hữu Tuấn',
  'Quốc Nguyễn Kinh',
  'Sang Nguyễn Lê',
  'Đức Nguyễn Minh',
  'Minh Nguyễn Ngọc',
  'Linh Nguyễn Phan Hùng',
  'Bảo Nguyễn Phương Gia',
  'Quân Nguyễn Thế',
  'Huy Nguyễn Thế'
];
const chefRows = sourceNames.map((source) => {
  const [given, ...familyAndMiddle] = source.normalize('NFC').trim().split(/\s+/);
  return { name: [...familyAndMiddle, given].join(' '), specialty: 'Pha chế' };
});
module.exports = { sourceNames, chefRows };
