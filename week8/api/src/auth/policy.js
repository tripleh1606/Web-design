const ROLES = Object.freeze(['admin', 'manager', 'chef', 'staff', 'customer']);
const grants = {
  admin: ['dish.read', 'dish.write', 'dish.availability.update', 'recipe.read', 'recipe.write', 'ingredient.read', 'ingredient.write', 'chef.read', 'chef.write', 'assignment.read', 'assignment.write', 'user.role.update'],
  manager: ['dish.read', 'dish.write', 'dish.availability.update', 'recipe.read', 'recipe.write', 'ingredient.read', 'ingredient.write', 'chef.read', 'chef.write', 'assignment.read', 'assignment.write'],
  chef: ['dish.read', 'dish.availability.update', 'recipe.read', 'ingredient.read', 'chef.read', 'assignment.read', 'assignment.self.write'],
  staff: ['dish.read'],
  customer: ['dish.read']
};
function can(role, action) {
  return Object.hasOwn(grants, role) && grants[role].includes(action);
}
function capabilities(role) {
  return Object.hasOwn(grants, role) ? [...grants[role]] : [];
}
module.exports = { ROLES, can, capabilities };
