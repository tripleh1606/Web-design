import { API_BASE_URL } from './config.js';

// axios is the browser HTTP client: one base URL, JSON only when a body exists,
// and one interceptor for network failures, HTTP 4xx/5xx, and HTTP 200 with ok:false.
const http = window.axios.create({
  baseURL: String(API_BASE_URL || '').replace(/\/$/, ''),
  timeout: 15000
});

export class ApiError extends Error {
  constructor(kind, details = {}) {
    super(details.message || 'Yêu cầu thất bại.');
    this.name = 'ApiError';
    this.kind = kind;
    this.status = details.status || 0;
    this.code = details.code || '';
    this.fields = details.fields || null;
  }
}

http.interceptors.response.use((response) => {
  const body = response.data;
  if (!body || typeof body !== 'object' || typeof body.ok !== 'boolean') {
    throw new ApiError('technical', {
      status: response.status,
      message: 'Phản hồi không đúng định dạng.'
    });
  }
  if (!body.ok) {
    throw new ApiError('business', {
      status: response.status,
      code: body.error && body.error.code,
      fields: (body.error && body.error.fields) || null,
      message: 'Dữ liệu không được chấp nhận.'
    });
  }
  return body.data;
}, (error) => {
  if (!error.response) {
    throw new ApiError('network', { message: 'Không nhận được phản hồi từ máy chủ.' });
  }
  throw new ApiError('technical', {
    status: error.response.status,
    message: 'Máy chủ không xử lý được yêu cầu.'
  });
});

const bases = {
  dishes: '/api/dishes',
  chefs: '/api/chefs',
  ingredients: '/api/ingredients'
};

const pathId = (id) => encodeURIComponent(id);

export function list(resource, params) {
  return http.get(bases[resource], { params });
}

export function getOne(resource, id) {
  return http.get(`${bases[resource]}/${pathId(id)}`);
}

export function create(resource, body) {
  return http.post(bases[resource], body);
}

export function update(resource, id, body) {
  return http.patch(`${bases[resource]}/${pathId(id)}`, body);
}

export function remove(resource, id) {
  return http.delete(`${bases[resource]}/${pathId(id)}`);
}

export function getRecipe(id) {
  return http.get(`/api/dishes/${pathId(id)}/recipe`);
}

export function addIngredient(dishId, body) {
  return http.post(`/api/dishes/${pathId(dishId)}/ingredients`, body);
}

export function updateIngredient(dishId, ingredientId, body) {
  return http.patch(`/api/dishes/${pathId(dishId)}/ingredients/${pathId(ingredientId)}`, body);
}

export function removeIngredient(dishId, ingredientId) {
  return http.delete(`/api/dishes/${pathId(dishId)}/ingredients/${pathId(ingredientId)}`);
}

export function getChefDishes(id) {
  return http.get(`/api/chefs/${pathId(id)}/dishes`);
}

export function addChefDish(chefId, body) {
  return http.post(`/api/chefs/${pathId(chefId)}/dishes`, body);
}

export function removeChefDish(chefId, dishId) {
  return http.delete(`/api/chefs/${pathId(chefId)}/dishes/${pathId(dishId)}`);
}
