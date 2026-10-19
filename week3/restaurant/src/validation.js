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

function parseId(value) {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id <= 2147483647 ? id : null;
}

function readText(body, key) {
  const value = body?.[key];
  return typeof value === 'string' ? value.trim() : '';
}

function validate(resource, body) {
  const config = resources[resource];
  const values = {};
  const data = {};
  const errors = {};

  for (const field of config.fields) {
    if (field.type === 'checkbox') {
      values[field.key] = body?.[field.key] === 'on';
      data[field.key] = values[field.key];
      continue;
    }

    const value = readText(body, field.key);
    values[field.key] = value;
    if (field.required && !value) {
      errors[field.key] = `${field.label} không được để trống.`;
      continue;
    }
    if (value.length > (field.multiline ? 1000 : 120)) {
      errors[field.key] = `${field.label} quá dài.`;
      continue;
    }
    if (field.key === 'image' && value && !/^\/beverages\/[a-z0-9_-]+\.(?:jpg|jpeg|png|webp)$/.test(value)) {
      errors[field.key] = 'Chọn đường dẫn ảnh trong thư mục /beverages/.';
      continue;
    }
    if (field.type === 'number') {
      const number = Number(value);
      if (!/^(0|[1-9]\d*)$/.test(value) || !Number.isSafeInteger(number) || number > 2147483647) {
        errors[field.key] = `${field.label} phải là số nguyên không âm.`;
      } else {
        data[field.key] = number;
      }
    } else {
      data[field.key] = value || null;
    }
  }

  // Required text fields are non-null once validation passes.
  return { values, data, errors, valid: Object.keys(errors).length === 0 };
}

function valuesFromRecord(resource, record) {
  return Object.fromEntries(resources[resource].fields.map((field) => [field.key, record[field.key] ?? '']));
}

module.exports = { resources, parseId, validate, valuesFromRecord };
