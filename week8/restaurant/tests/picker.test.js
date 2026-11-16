const assert = require('node:assert/strict');
const { test } = require('node:test');

test('picker search ignores case and Vietnamese diacritics', async () => {
  const { foldText, matchesPickerQuery } = await import('../web/picker.js');
  assert.equal(foldText('Bột'), 'bot');
  assert.equal(matchesPickerQuery('Bột matcha', 'bot'), true);
  assert.equal(matchesPickerQuery('Sữa tươi', 'SUA'), true);
  assert.equal(matchesPickerQuery('Sữa tươi', 'tra'), false);
  assert.equal(matchesPickerQuery('Trần Thu Hà', '  '), true);
});

test('picker images stay on safe URLs and avatars fall back to initials', async () => {
  const { initials, pickerImage, safeImage } = await import('../web/picker.js');
  assert.equal(safeImage('/beverages/matcha-latte.jpeg'), '/beverages/matcha-latte.jpeg');
  assert.equal(safeImage('https://cdn.example/a.jpg'), 'https://cdn.example/a.jpg');
  assert.equal(safeImage('javascript:alert(1)'), '');
  assert.equal(safeImage('//evil.example/a.png'), '');
  assert.equal(pickerImage({ image: null, avatar: '/chefs/an.png' }), '/chefs/an.png');
  assert.equal(pickerImage({ photo: 'javascript:alert(1)' }), '');
  assert.equal(pickerImage(null), '');
  assert.equal(initials('Trần Thu Hà'), 'TH');
  assert.equal(initials('An'), 'A');
  assert.equal(initials('   '), '•');
});
