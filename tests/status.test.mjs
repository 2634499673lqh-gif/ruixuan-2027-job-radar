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

test("三个视图计数互斥且完整", () => {
  const jobs = [{ id: "a" }, { id: "b" }, { id: "c" }];
  assert.deepEqual(statusCounts(jobs, { b: "已投递", c: "Pass" }), { pending: 1, applied: 1, passed: 1 });
});
