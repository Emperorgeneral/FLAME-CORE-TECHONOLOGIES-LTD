import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateCloudTerminalUpgradeAmount,
  calculateFlameBotCheckoutAmount,
  normalizeCloudTerminalSlots,
} from '../src/companyPayments.js';

const monthly = { plan_code: 'monthly', billing_period: 'month', price_usd_cents: 1000 };
const yearly = { plan_code: 'yearly', billing_period: 'year', price_usd_cents: 10000 };

test('calculates Standard and Cloud Terminal monthly prices', () => {
  assert.equal(calculateFlameBotCheckoutAmount(monthly, 0), 1000);
  assert.equal(calculateFlameBotCheckoutAmount(monthly, 1), 1500);
  assert.equal(calculateFlameBotCheckoutAmount(monthly, 2), 2000);
  assert.equal(calculateFlameBotCheckoutAmount(monthly, 3), 2500);
  assert.equal(calculateFlameBotCheckoutAmount(monthly, 4), 3000);
});

test('calculates yearly prices with the annual Cloud Terminal add-on', () => {
  assert.equal(calculateFlameBotCheckoutAmount(yearly, 0), 10000);
  assert.equal(calculateFlameBotCheckoutAmount(yearly, 1), 15000);
  assert.equal(calculateFlameBotCheckoutAmount(yearly, 2), 20000);
  assert.equal(calculateFlameBotCheckoutAmount(yearly, 3), 25000);
  assert.equal(calculateFlameBotCheckoutAmount(yearly, 4), 30000);
});

test('rejects invalid Cloud Terminal quantities and retired billing periods', () => {
  assert.equal(normalizeCloudTerminalSlots(-1), null);
  assert.equal(normalizeCloudTerminalSlots(5), null);
  assert.equal(normalizeCloudTerminalSlots(1.5), null);
  assert.throws(
    () => calculateFlameBotCheckoutAmount({ billing_period: 'week', price_usd_cents: 500 }, 1),
    /monthly and yearly/i,
  );
});

test('charges only the additional Cloud Terminal slots for active upgrades', () => {
  assert.equal(calculateCloudTerminalUpgradeAmount(monthly, 0, 1), 500);
  assert.equal(calculateCloudTerminalUpgradeAmount(monthly, 1, 2), 500);
  assert.equal(calculateCloudTerminalUpgradeAmount(monthly, 1, 4), 1500);
  assert.equal(calculateCloudTerminalUpgradeAmount(yearly, 0, 1), 5000);
  assert.equal(calculateCloudTerminalUpgradeAmount(yearly, 2, 4), 10000);
  assert.throws(
    () => calculateCloudTerminalUpgradeAmount(monthly, 2, 2),
    /must increase/i,
  );
});
