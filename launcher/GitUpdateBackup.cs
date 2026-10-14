using System;
using System.IO;
using System.Text;

// Preserve tracked work, including the index, while a fast-forward update is applied.
// Keep the stash as a durable backup even after a successful update.
internal sealed class GitUpdateBackup
{
    private readonly Func<string, GitResult> git;
    private readonly Action<string> log;
    private readonly string backupRoot;
    private string before;
    private string stash;
    private bool prepared;

    public GitUpdateBackup(Func<string, GitResult> runGit, Action<string> writeLog, string backups)
    {
        git = runGit;
        log = writeLog;
        backupRoot = backups;
    }

    private GitResult Require(string arguments)
    {
        var result = git(arguments);
        if (result.ExitCode != 0) throw new InvalidOperationException(result.Output.Trim());
        return result;
    }

    public void Prepare(string originalHead)
    {
        before = originalHead;
        if (Require("--no-pager diff --name-only --diff-filter=U").StandardOutput.Trim().Length > 0)
            throw new InvalidOperationException("仓库已有未解决的合并冲突，更新未执行，请先处理冲突。");
        var dirty = git("--no-pager diff --quiet HEAD --");
        if (dirty.ExitCode != 0 && dirty.ExitCode != 1)
            throw new InvalidOperationException("无法检查本地修改：" + dirty.Output.Trim());
        if (dirty.ExitCode == 1)
        {
            // Creating the directory first ensures backup metadata can be saved before merging.
            string directory = Path.Combine(backupRoot, "tracked-" + DateTime.Now.ToString("yyyyMMdd-HHmmss-fff"));
            Directory.CreateDirectory(directory);
            Require("stash push -m \"caifujing-launcher-local-backup-" + DateTime.Now.ToString("yyyyMMdd-HHmmss-fff") + "\"");
            stash = Require("--no-pager rev-parse --verify refs/stash").StandardOutput.Trim();
            prepared = true;
            File.WriteAllText(Path.Combine(directory, "恢复说明.txt"),
                "更新前版本：" + before + "\r\n本地修改备份：" + stash +
                "\r\n备份包含修改的源码和暂存区，不包含未跟踪文件。\r\n" +
                "恢复命令（先保存当前修改）：git stash apply --index " + stash + "\r\n", new UTF8Encoding(false));
            log("本地源码修改已备份，更新后将自动还原。备份：" + directory);
        }
        prepared = true;
    }

    public void Reapply()
    {
        if (String.IsNullOrEmpty(stash)) return;
        var result = git("stash apply --index " + stash);
        if (result.ExitCode != 0)
            throw new InvalidOperationException("新版本与本地修改存在冲突，正在恢复更新前版本。备份 " + stash + "。\r\n" + result.Output.Trim());
        log("本地源码修改已还原，备份继续保留。");
    }

    public bool Rollback()
    {
        if (!prepared) return true;
        // No untracked files are deleted. The tracked work was saved before Prepare completed.
        // Only roll back this transaction's head; preserve the original index using --index.
        var head = git("--no-pager rev-parse HEAD");
        var conflicts = git("--no-pager diff --name-only --diff-filter=U");
        bool needsReset = head.ExitCode != 0 || head.StandardOutput.Trim() != before ||
            conflicts.ExitCode != 0 || conflicts.StandardOutput.Trim().Length > 0;
        if (needsReset && git("reset --hard " + before).ExitCode != 0)
        {
            log("自动恢复版本失败，备份仍保留；服务不会启动，请查看日志。");
            return false;
        }
        if (!String.IsNullOrEmpty(stash) && git("stash apply --index " + stash).ExitCode != 0)
        {
            log("自动恢复本地修改失败，备份 " + stash + " 仍保留；服务不会启动。");
            return false;
        }
        log("已恢复更新前版本和本地源码修改。");
        return true;
    }
}
