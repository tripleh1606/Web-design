export const resources = {
  dishes: { label: 'Món ăn', singular: 'món ăn', fields: [
    { key: 'name', label: 'Tên món', required: true },
    { key: 'description', label: 'Mô tả', type: 'textarea', max: 1000 },
    { key: 'price', label: 'Giá (VND)', type: 'number', required: true },
    { key: 'category', label: 'Danh mục', placeholder: 'coffee / matcha / houjicha' },
    { key: 'image', label: 'Ảnh món', placeholder: '/beverages/matcha-latte.jpeg' },
    { key: 'available', label: 'Đang phục vụ', type: 'checkbox' }
  ] },
  chefs: { label: 'Đầu bếp', singular: 'đầu bếp', fields: [
    { key: 'name', label: 'Tên đầu bếp', required: true }, { key: 'specialty', label: 'Chuyên môn', required: true }
  ] },
  ingredients: { label: 'Nguyên liệu', singular: 'nguyên liệu', fields: [
    { key: 'name', label: 'Tên nguyên liệu', required: true }, { key: 'unit', label: 'Đơn vị', required: true },
    { key: 'stock', label: 'Tồn kho', type: 'number', required: true }
  ] }
};
export const money = (value) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value);
export const categoryLabel = (value) => ({ coffee: 'Coffee', matcha: 'Matcha', houjicha: 'Houjicha' })[value] || value || 'Chưa phân loại';

export function validateForm(resource, values) {
  const errors = {};
  for (const field of resources[resource].fields) {
    const value = values[field.key];
    if (field.type === 'checkbox') continue;
    if (field.required && !String(value ?? '').trim()) errors[field.key] = 'Trường này không được để trống.';
    else if (field.type === 'number' && (!/^\d+$/.test(value) || Number(value) > 2147483647)) errors[field.key] = 'Nhập số nguyên không âm, tối đa 2147483647.';
    else if (String(value || '').length > (field.max || 120)) errors[field.key] = `Tối đa ${field.max || 120} ký tự.`;
    else if (field.key === 'image' && value && !/^\/beverages\/[a-z0-9_-]+\.(jpg|jpeg|png|webp)$/.test(value)) errors[field.key] = 'Dùng đường dẫn /beverages/ten-anh.jpeg.';
  }
  return errors;
}
