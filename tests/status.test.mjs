import test from "node:test";
import assert from "node:assert/strict";
import { bucketForStatus, statusCounts } from "../assets/status.js";

test("已投递流程进入已投递视图", () => {
  for (const status of ["已投递", "已笔试", "已面试", "已挂"]) assert.equal(bucketForStatus(status), "applied");
});

test("Pass 单独进入隐藏视图且可恢复", () => {
  assert.equal(bucketForStatus("Pass"), "passed");
  assert.equal(bucketForStatus("未投递"), "pending");
});

test("暂不投递单独进入稍后再看视图", () => {
  assert.equal(bucketForStatus("暂不投递"), "deferred");
  assert.equal(bucketForStatus("准备中"), "pending");
});

test("四个视图计数互斥且完整", () => {
  const jobs = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
  assert.deepEqual(statusCounts(jobs, { b: "暂不投递", c: "已投递", d: "Pass" }), { pending: 1, deferred: 1, applied: 1, passed: 1 });
});
