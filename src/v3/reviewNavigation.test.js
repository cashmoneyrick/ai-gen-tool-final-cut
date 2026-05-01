import test from 'node:test'
import assert from 'node:assert/strict'
import {
  findOutputIndexById,
  resolveSelectedOutputId,
  getNearbyImageUrls,
} from './reviewNavigation.js'

test('findOutputIndexById finds the selected output by id', () => {
  assert.equal(findOutputIndexById([{ id: 'a' }, { id: 'b' }], 'b'), 1)
})

test('resolveSelectedOutputId keeps selected id after new outputs arrive before it', () => {
  const outputs = [{ id: 'new' }, { id: 'old' }]
  assert.equal(resolveSelectedOutputId(outputs, 'old', 1), 'old')
})

test('resolveSelectedOutputId falls back to nearest valid output when selected id is missing', () => {
  const outputs = [{ id: 'a' }, { id: 'b' }]
  assert.equal(resolveSelectedOutputId(outputs, 'missing', 1), 'b')
})

test('getNearbyImageUrls returns nearby image URLs without the current image', () => {
  const outputs = [
    { id: 'a', imagePath: 'a.jpg' },
    { id: 'b', imagePath: 'b.jpg' },
    { id: 'c', imagePath: 'c.jpg' },
  ]
  assert.deepEqual(getNearbyImageUrls(outputs, 1, 1), ['/api/images/a', '/api/images/c'])
})
