import test from "node:test";
import assert from "node:assert/strict";
import { classify, isEligible, stableId } from "../scripts/rules.mjs";

test("只接受2027届广东正式校招", () => {
  assert.equal(isEligible("2027届校园招聘 深圳 海外业务专员", ""), true);
  assert.equal(isEligible("2027届暑期实习 深圳 海外业务", ""), false);
  assert.equal(isEligible("2026届校园招聘 深圳 海外业务", ""), false);
  assert.equal(isEligible("2027届校园招聘 上海 海外业务", ""), false);
});
test("岗位方向分类", () => { assert.equal(classify("商务专员 销售支持").name, "国际商务"); assert.equal(classify("供应链采购").name, "供应链"); });
test("稳定ID可复现", () => { assert.equal(stableId("A", "B", "https://x"), stableId("A", "B", "https://x")); });
