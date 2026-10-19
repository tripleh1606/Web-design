const resources = {
  dishes: {
    model: 'dish',
    singular: 'Món ăn',
    plural: 'Món ăn',
    fields: [
      { key: 'name', label: 'Tên món', required: true },
      { key: 'description', label: 'Mô tả', multiline: true },
      { key: 'price', label: 'Giá (VND)', required: true, type: 'number' },
      { key: 'category', label: 'Danh mục' },
      { key: 'image', label: 'Ảnh món' },
      { key: 'available', label: 'Đang phục vụ', type: 'checkbox' }
    ]
  },
  chefs: {
    model: 'chef',
    singular: 'Đầu bếp',
    plural: 'Đầu bếp',
    fields: [
      { key: 'name', label: 'Tên đầu bếp', required: true },
      { key: 'specialty', label: 'Chuyên môn', required: true }
    ]
  },
  ingredients: {
    model: 'ingredient',
    singular: 'Nguyên liệu',
    plural: 'Nguyên liệu',
    fields: [
      { key: 'name', label: 'Tên nguyên liệu', required: true },
      { key: 'unit', label: 'Đơn vị', required: true },
      { key: 'stock', label: 'Tồn kho', required: true, type: 'number' }
    ]
  }
};

const IMAGE_PATH = /^\/beverages\/[a-z0-9_-]+\.(?:jpg|jpeg|png|webp)$/;

function parseId(value) {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id <= 2147483647 ? id : null;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

// POST checks every field. PATCH checks only keys present in the body.
function validate(resource, body, { partial = false } = {}) {
  const config = resources[resource];
  const data = {};
  const errors = {};
  if (!isPlainObject(body)) return { data, errors, valid: false };

  for (const field of config.fields) {
    if (partial && !Object.prototype.hasOwnProperty.call(body, field.key)) continue;
    const raw = body[field.key];

    if (field.type === 'checkbox') {
      if (typeof raw !== 'boolean') errors[field.key] = `${field.label} phải là true hoặc false.`;
      else data[field.key] = raw;
      continue;
    }

    if (field.type === 'number') {
      if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 0 || raw > 2147483647) {
        errors[field.key] = `${field.label} phải là số nguyên không âm.`;
      } else {
        data[field.key] = raw;
      }
      continue;
    }

    if (raw == null || raw === '') {
      if (field.required) errors[field.key] = `${field.label} không được để trống.`;
      else data[field.key] = null;
      continue;
    }

    if (typeof raw !== 'string') {
      errors[field.key] = `${field.label} phải là chuỗi.`;
      continue;
    }

    const value = raw.trim();
    if (field.required && !value) {
      errors[field.key] = `${field.label} không được để trống.`;
      continue;
    }
    if (value.length > (field.multiline ? 1000 : 120)) {
      errors[field.key] = `${field.label} quá dài.`;
      continue;
    }
    if (field.key === 'image' && value && !IMAGE_PATH.test(value)) {
      errors[field.key] = 'Chọn đường dẫn ảnh trong thư mục /beverages/.';
      continue;
    }
    data[field.key] = value || null;
  }

  return { data, errors, valid: Object.keys(errors).length === 0 };
}

module.exports = { resources, parseId, validate };
