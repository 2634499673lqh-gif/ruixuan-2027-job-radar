export const statusOptions = ["未投递", "准备中", "已投递", "已笔试", "已面试", "已挂", "暂不投递", "Pass"];
export const appliedStatuses = new Set(["已投递", "已笔试", "已面试", "已挂"]);

export function bucketForStatus(status = "未投递") {
  if (status === "Pass") return "passed";
  if (status === "暂不投递") return "deferred";
  if (appliedStatuses.has(status)) return "applied";
  return "pending";
}

export function statusCounts(jobs, saved) {
  return jobs.reduce((counts, job) => {
    counts[bucketForStatus(saved[job.id] || "未投递")] += 1;
    return counts;
  }, { pending: 0, deferred: 0, applied: 0, passed: 0 });
}
