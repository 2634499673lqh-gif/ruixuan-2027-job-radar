import test from "node:test";
import assert from "node:assert/strict";
import { assessCandidate, cleanRoleTitle, classify, isEligible, isLikelyRoleTitle, stableId } from "../scripts/rules.mjs";

test("只接受2027届广东正式校招", () => {
  assert.equal(isEligible("2027届校园招聘 深圳 海外业务专员", ""), true);
  assert.equal(isEligible("2027届暑期实习 深圳 海外业务", ""), false);
  assert.equal(isEligible("2026届校园招聘 深圳 海外业务", ""), false);
  assert.equal(isEligible("2027届校园招聘 上海 海外业务", ""), false);
});
test("岗位方向分类", () => { assert.equal(classify("商务专员 销售支持").name, "国际商务"); assert.equal(classify("供应链采购").name, "供应链"); });
test("稳定ID可复现", () => { assert.equal(stableId("A", "B", "https://x"), stableId("A", "B", "https://x")); });
test("总部在广东不能冒充岗位地点", () => {
  const result = assessCandidate("2027届 海外业务专员 上海", { defaultCity: "深圳", locationMode: "explicit" }, true);
  assert.equal(result.eligible, false);
});
test("可能在广东的官方入口只能作为待核验线索", () => {
  const result = assessCandidate("2027届 海外业务专员", { allowLocationLead: true }, true);
  assert.equal(result.eligible, true);
  assert.equal(result.confidence, "待官网核验");
});
test("明确2027届广东岗位为已核验具体岗位", () => {
  const result = assessCandidate("2027届 深圳 商务专员", {}, false);
  assert.equal(result.confidence, "已核验具体岗位");
});
test("企业介绍不能作为岗位名称", () => {
  assert.equal(isLikelyRoleTitle("沃尔玛业态致力于通过打造差异化的商品、信任感以及全渠道便利，成为顾客最信任的购物首选地。"), false);
  assert.equal(isLikelyRoleTitle("供应链族共16个职位"), false);
  assert.equal(isLikelyRoleTitle("招聘岗位"), false);
});
test("动态招聘卡片只保留真实岗位名称", () => {
  assert.equal(cleanRoleTitle("FILA商品运营岗-总部（2027届）发布于 2026-08-12斐乐品牌_20104001"), "FILA商品运营岗-总部（2027届）");
  assert.equal(isLikelyRoleTitle("FILA商品运营岗-总部（2027届）"), true);
});
test("明确写明省外地点的岗位不能作为广东待核验线索", () => {
  assert.equal(assessCandidate("2027届 订单管理岗 浙江衢州", { allowLocationLead: true }, true).eligible, false);
});
