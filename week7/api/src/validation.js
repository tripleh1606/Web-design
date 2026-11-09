const resources = {
  dishes: { model: 'dish', fields: {
    name: { required: true }, description: { nullable: true, max: 1000 },
    price: { required: true, type: 'integer' }, category: { nullable: true },
    image: { nullable: true, image: true }, available: { type: 'boolean', default: true }
  } },
  chefs: { model: 'chef', fields: { name: { required: true }, specialty: { required: true } } },
  ingredients: { model: 'ingredient', fields: {
    name: { required: true }, unit: { required: true }, stock: { type: 'integer', default: 0 }
  } }
};

function parseId(value) {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id <= 2147483647 ? id : null;
}

// JSON keeps types: "30000" is invalid even though 30000 is valid.
// PATCH validates only supplied fields. Unknown keys never reach Prisma.
function validate(resource, body, partial = false) {
  const data = {};
  const fields = {};
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { data, fields: { _form: 'Body phải là một JSON object.' } };
  }
  for (const [key, rule] of Object.entries(resources[resource].fields)) {
    if (!Object.hasOwn(body, key)) {
      if (partial) continue;
      if (rule.required) fields[key] = 'Trường này bắt buộc.';
      else if (Object.hasOwn(rule, 'default')) data[key] = rule.default;
      continue;
    }
    const value = body[key];
    if (rule.type === 'integer') {
      if (!Number.isInteger(value) || value < 0 || value > 2147483647) fields[key] = 'Phải là số nguyên không âm, tối đa 2147483647.';
      else data[key] = value;
    } else if (rule.type === 'boolean') {
      if (typeof value !== 'boolean') fields[key] = 'Phải là true hoặc false.';
      else data[key] = value;
    } else if (value === null && rule.nullable) {
      data[key] = null;
    } else if (typeof value !== 'string') {
      fields[key] = 'Phải là chuỗi ký tự.';
    } else {
      const text = value.trim();
      if (rule.required && !text) fields[key] = 'Trường này không được để trống.';
      else if (text.length > (rule.max || 120)) fields[key] = `Tối đa ${rule.max || 120} ký tự.`;
      else if (rule.image && text && !/^\/beverages\/[a-z0-9_-]+\.(jpg|jpeg|png|webp)$/.test(text)) fields[key] = 'Dùng đường dẫn /beverages/ten-anh.jpeg.';
      else data[key] = text || (rule.nullable ? null : '');
    }
  }
  if (partial && !Object.keys(data).length && !Object.keys(fields).length && !(resource === 'dishes' && Object.hasOwn(body, 'ingredients'))) fields._form = 'Cần ít nhất một trường hợp lệ để sửa.';
  return { data, fields };
}

module.exports = { resources, parseId, validate };
