using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;

internal static class Program
{
    [STAThread]
    private static void Main(string[] args)
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        bool test = Array.IndexOf(args, "--self-test") >= 0;
        bool fresh;
        string key = Convert.ToBase64String(Encoding.UTF8.GetBytes(AppDomain.CurrentDomain.BaseDirectory)).Replace('/', '_');
        using (var mutex = new Mutex(true, "Local\\CaifuJingLauncher." + key, out fresh))
        {
            if (!fresh)
            {
                MessageBox.Show("财富经启动器已经打开，请使用已有窗口。", "财富经");
                return;
            }
            Application.Run(new LauncherForm(test));
        }
    }
}

internal sealed class GitResult
{
    public string Output = "";
    public string StandardOutput = "";
    public int ExitCode;
}

internal sealed class LauncherForm : Form
{
    private const string UpdateCaption = "一键更新网站（GitHub → 本地，自动重启）";
    private readonly string root = AppDomain.CurrentDomain.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar);
    private readonly Color gold = Color.FromArgb(235, 190, 92);
    private readonly Color muted = Color.FromArgb(158, 169, 183);
    private readonly Color danger = Color.FromArgb(243, 134, 126);
    private readonly Label state = new Label();
    private readonly Label address = new Label();
    private readonly Label mode = new Label();
    private readonly Label versionLabel = new Label();
    private readonly Button start = new Button();
    private readonly Button stop = new Button();
    private readonly Button browse = new Button();
    private readonly Button update = new Button();
    private readonly TextBox output = new TextBox();
    private readonly System.Windows.Forms.Timer monitor = new System.Windows.Forms.Timer();
    private Process child;
    private bool busy, running, closing;
    private bool updateNetworkFailure;
    private string url;
    private readonly bool selfTest;

    public LauncherForm(bool test)
    {
        selfTest = test;
        Text = "财富经 · 本地网站启动器";
        ClientSize = new Size(620, 656);
        FormBorderStyle = FormBorderStyle.FixedSingle;
        MaximizeBox = false;
        StartPosition = FormStartPosition.CenterScreen;
        AutoScaleMode = AutoScaleMode.Dpi;
        BackColor = Color.FromArgb(17, 23, 32);
        ForeColor = Color.FromArgb(235, 239, 245);
        Font = new Font("Microsoft YaHei UI", 10F);
        string assets = Path.Combine(root, "launcher");
        if (File.Exists(Path.Combine(assets, "money.ico"))) Icon = new Icon(Path.Combine(assets, "money.ico"));
        var picture = new PictureBox { Bounds = new Rectangle(26, 23, 84, 84), SizeMode = PictureBoxSizeMode.Zoom };
        if (File.Exists(Path.Combine(assets, "money.png"))) picture.Image = Image.FromFile(Path.Combine(assets, "money.png"));
        Controls.Add(picture);
        AddLabel("财富经", new Rectangle(126, 29, 330, 39), 23F, gold);
        AddLabel("本地网站  /  一键启动 · 一键更新", new Rectangle(129, 76, 440, 28), 11F, muted);

        var card = new Panel { Bounds = new Rectangle(28, 128, 564, 120), BackColor = Color.FromArgb(27, 36, 48) };
        state.SetBounds(20, 16, 524, 26);
        state.Font = new Font(Font.FontFamily, 12F, FontStyle.Bold);
        state.Text = "准备就绪";
        address.SetBounds(20, 49, 524, 23);
        address.Text = "启动后自动打开浏览器";
        address.ForeColor = muted;
        mode.SetBounds(20, 80, 524, 23);
        mode.Text = "关闭启动器时会停止本窗口启动的服务";
        mode.ForeColor = muted;
        card.Controls.AddRange(new Control[] { state, address, mode });
        Controls.Add(card);

        SetupButton(start, "启动网站", new Rectangle(28, 268, 244, 48), gold, Color.FromArgb(26, 29, 34));
        SetupButton(stop, "停止服务", new Rectangle(284, 268, 148, 48), Color.FromArgb(38, 49, 65), ForeColor);
        SetupButton(browse, "打开网站", new Rectangle(444, 268, 148, 48), Color.FromArgb(38, 49, 65), ForeColor);
        SetupButton(update, UpdateCaption, new Rectangle(28, 326, 564, 46), Color.FromArgb(30, 82, 66), Color.FromArgb(178, 240, 214));
        stop.Enabled = browse.Enabled = false;
        start.Click += async delegate { await StartSiteAsync(true); };
        stop.Click += delegate { StopSite(); };
        browse.Click += delegate { OpenWebsite(); };
        update.Click += async delegate { await UpdateSiteAsync(true); };

        AddLabel("运行日志", new Rectangle(28, 388, 520, 23), 10F, muted);
        output.SetBounds(28, 417, 564, 138);
        output.Multiline = output.ReadOnly = true;
        output.ScrollBars = ScrollBars.Vertical;
        output.BorderStyle = BorderStyle.FixedSingle;
        output.BackColor = Color.FromArgb(12, 18, 26);
        output.ForeColor = Color.FromArgb(193, 204, 218);
        output.Font = new Font("Microsoft YaHei UI", 9F);
        Controls.Add(output);
        versionLabel.SetBounds(28, 565, 564, 22);
        versionLabel.ForeColor = muted;
        versionLabel.Font = new Font(Font.FontFamily, 8.5F);
        versionLabel.Text = "当前版本：读取中…";
        versionLabel.AutoEllipsis = true;
        Controls.Add(versionLabel);
        AddLabel("项目位置：" + root, new Rectangle(28, 589, 564, 22), 8.5F, muted);
        AddLabel("一键更新会备份并保留本地修改，拉取 GitHub 最新代码后自动重启。", new Rectangle(28, 613, 564, 22), 8.5F, muted);
        monitor.Interval = 1000;
        monitor.Tick += delegate
        {
            if (running && child != null && child.HasExited)
            {
                int code = child.ExitCode;
                StopSite();
                state.Text = "服务已退出，可重新启动";
                Log("服务退出，退出码 " + code + "。请查看上方日志。");
            }
        };
        monitor.Start();
        FormClosing += delegate { closing = true; StopSite(); monitor.Dispose(); };
        Shown += async delegate
        {
            await RefreshVersionAsync();
            if (selfTest) await RunSelfTestAsync();
            else await StartSiteAsync(true);
        };
        if (selfTest) { ShowInTaskbar = false; Opacity = 0; }
    }

    private void AddLabel(string text, Rectangle bounds, float size, Color color)
    {
        Controls.Add(new Label { Text = text, Bounds = bounds, ForeColor = color, Font = new Font(Font.FontFamily, size), AutoEllipsis = true });
    }

    private void SetupButton(Button button, string text, Rectangle bounds, Color background, Color foreground)
    {
        button.Text = text;
        button.Bounds = bounds;
        button.BackColor = background;
        button.ForeColor = foreground;
        button.FlatStyle = FlatStyle.Flat;
        button.FlatAppearance.BorderSize = 0;
        button.Cursor = Cursors.Hand;
        Controls.Add(button);
    }

    private void Log(string line)
    {
        if (String.IsNullOrWhiteSpace(line) || closing || IsDisposed) return;
        if (InvokeRequired)
        {
            try { BeginInvoke(new Action<string>(Log), line); } catch (InvalidOperationException) { }
            return;
        }
        // ponytail: bound the on-screen log; the file keeps the complete session.
        if (output.TextLength > 40000) output.Text = output.Text.Substring(output.TextLength - 20000);
        string message = "[" + DateTime.Now.ToString("HH:mm:ss") + "] " + line + Environment.NewLine;
        output.AppendText(message);
        try { File.AppendAllText(Path.Combine(root, "launcher", "launcher.log"), message, Encoding.UTF8); }
        catch (IOException) { } catch (UnauthorizedAccessException) { }
    }

    private void LogBlock(string text)
    {
        if (String.IsNullOrWhiteSpace(text)) return;
        foreach (string line in text.Replace("\r\n", "\n").Split('\n'))
        {
            if (line.Trim().Length > 0) Log(line.TrimEnd());
        }
    }

    private static string FindNode()
    {
        foreach (string directory in (Environment.GetEnvironmentVariable("PATH") ?? "").Split(';'))
        {
            try
            {
                string file = Path.Combine(directory.Trim('"'), "node.exe");
                if (File.Exists(file)) return file;
            }
            catch (ArgumentException) { }
        }
        string fallback = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "nodejs", "node.exe");
        if (File.Exists(fallback)) return fallback;
        throw new InvalidOperationException("未找到 Node.js。请安装 Node.js 22 或更新版本，再打开启动器。");
    }

    private static string FindGit()
    {
        foreach (string directory in (Environment.GetEnvironmentVariable("PATH") ?? "").Split(';'))
        {
            try
            {
                string file = Path.Combine(directory.Trim('"'), "git.exe");
                if (File.Exists(file)) return file;
            }
            catch (ArgumentException) { }
        }
        string[] fallbacks = new string[] {
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), @"Git\cmd\git.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), @"Git\cmd\git.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"Programs\Git\cmd\git.exe"),
            @"C:\Program Files\Git\bin\git.exe"
        };
        foreach (string candidate in fallbacks)
        {
            if (File.Exists(candidate)) return candidate;
        }
        throw new InvalidOperationException("未找到 Git。一键更新需要 Git for Windows，请先安装 https://git-scm.com/download/win 后重试。");
    }

    private Process Launch(string node, string arguments, int port)
    {
        var info = new ProcessStartInfo(node, arguments) {
            WorkingDirectory = root, UseShellExecute = false, CreateNoWindow = true,
            RedirectStandardOutput = true, RedirectStandardError = true,
            StandardOutputEncoding = Encoding.UTF8, StandardErrorEncoding = Encoding.UTF8
        };
        info.EnvironmentVariables["NO_COLOR"] = "1";
        info.EnvironmentVariables["NODE_ENV"] = "development";
        // Node's fetch ignores HTTPS_PROXY unless this is set, so Gemini calls
        // would otherwise bypass the local proxy and time out.
        info.EnvironmentVariables["NODE_USE_ENV_PROXY"] = "1";
        if (port > 0) info.EnvironmentVariables["PORT"] = port.ToString();
        var process = new Process { StartInfo = info };
        process.OutputDataReceived += delegate(object sender, DataReceivedEventArgs e) { Log(e.Data); };
        process.ErrorDataReceived += delegate(object sender, DataReceivedEventArgs e) { Log(e.Data); };
        child = process;
        process.Start();
        process.BeginOutputReadLine();
        process.BeginErrorReadLine();
        return process;
    }

    // Run one git command in the project root and collect its combined output.
    private GitResult Git(string git, string arguments, bool echo)
    {
        var info = new ProcessStartInfo(git, arguments) {
            WorkingDirectory = root, UseShellExecute = false, CreateNoWindow = true,
            RedirectStandardOutput = true, RedirectStandardError = true,
            StandardOutputEncoding = Encoding.UTF8, StandardErrorEncoding = Encoding.UTF8
        };
        // Never let git wait for a hidden credential prompt: fail fast instead of freezing the window.
        info.EnvironmentVariables["GIT_TERMINAL_PROMPT"] = "0";
        info.EnvironmentVariables["GIT_PAGER"] = "cat";
        info.EnvironmentVariables["NO_COLOR"] = "1";
        var result = new GitResult();
        var buffer = new StringBuilder();
        var standardOutput = new StringBuilder();
        using (var process = new Process { StartInfo = info })
        {
            process.OutputDataReceived += delegate(object sender, DataReceivedEventArgs e) {
                Collect(standardOutput, e.Data, false);
                Collect(buffer, e.Data, echo);
            };
            process.ErrorDataReceived += delegate(object sender, DataReceivedEventArgs e) { Collect(buffer, e.Data, echo); };
            process.Start();
            process.BeginOutputReadLine();
            process.BeginErrorReadLine();
            process.WaitForExit();
            result.ExitCode = process.ExitCode;
        }
        result.Output = buffer.ToString();
        result.StandardOutput = standardOutput.ToString();
        return result;
    }

    private void Collect(StringBuilder buffer, string line, bool echo)
    {
        if (line == null) return;
        lock (buffer) { buffer.AppendLine(line); }
        if (echo) Log(line);
    }

    private static bool IsNetworkProblem(string text)
    {
        string[] marks = new string[] {
            "could not resolve host", "unable to access", "failed to connect", "couldn't connect",
            "connection timed out", "connection reset", "connection refused", "network is unreachable",
            "could not read from remote repository", "terminal prompts disabled", "authentication failed",
            "ssl certificate problem", "rpc failed", "early eof", "empty reply from server", "proxy"
        };
        foreach (string mark in marks)
        {
            if (text.IndexOf(mark, StringComparison.OrdinalIgnoreCase) >= 0) return true;
        }
        return false;
    }

    private string UpdateFailureHint(string text, int exitCode)
    {
        if (IsNetworkProblem(text))
        {
            updateNetworkFailure = true;
            return "无法连接 GitHub（网络、代理或登录状态异常），已保持原版本。";
        }
        if (text.IndexOf("local changes", StringComparison.OrdinalIgnoreCase) >= 0)
            return "本地源码有未提交的改动，已停止更新以保护你的修改。请先提交或撤消改动。";
        if (text.IndexOf("untracked working tree files", StringComparison.OrdinalIgnoreCase) >= 0)
            return "更新被本机未跟踪的文件阻挡，请把它们移出项目目录后重试（例如 package-lock.json）。";
        if (text.IndexOf("Not possible to fast-forward", StringComparison.OrdinalIgnoreCase) >= 0 || text.IndexOf("diverged", StringComparison.OrdinalIgnoreCase) >= 0)
            return "本地与 GitHub 的版本已分叉，无法自动更新，请手动处理后再试。";
        if (text.IndexOf("not a git repository", StringComparison.OrdinalIgnoreCase) >= 0)
            return "当前目录不是 Git 仓库，无法从 GitHub 更新。";
        return "git pull 失败，退出码 " + exitCode + "，详情见运行日志。";
    }

    // git refuses to pull when an incoming file is blocked by an untracked local file.
    // Move those exact files into launcher\backup-<time> so the update can continue, and never touch folders.
    private bool TryBackupBlockingFiles(string pullOutput, out string backupName)
    {
        backupName = "launcher\\backup-" + DateTime.Now.ToString("yyyyMMdd-HHmmss");
        var blocking = new List<string>();
        bool listing = false;
        foreach (string raw in pullOutput.Replace("\r\n", "\n").Split('\n'))
        {
            string line = raw.TrimEnd();
            if (!listing)
            {
                if (line.IndexOf("untracked working tree files would be overwritten", StringComparison.OrdinalIgnoreCase) >= 0) listing = true;
                continue;
            }
            if (line.Length == 0 || (line[0] != '\t' && line[0] != ' ')) break;
            string relative = line.Trim();
            if (relative.Length > 0) blocking.Add(relative);
        }
        if (blocking.Count == 0 || blocking.Count > 50) return false;
        foreach (string relative in blocking)
        {
            string source = Path.GetFullPath(Path.Combine(root, relative));
            if (!source.StartsWith(root + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)) return false;
            if (Directory.Exists(source)) return false;
            if (!File.Exists(source)) return false;
        }
        string backupRoot = Path.Combine(root, backupName);
        foreach (string relative in blocking)
        {
            string source = Path.Combine(root, relative);
            string target = Path.Combine(backupRoot, relative);
            try
            {
                Directory.CreateDirectory(Path.GetDirectoryName(target));
                File.Move(source, target);
                Log("已备份本机文件：" + relative + " → " + backupName);
            }
            catch (Exception error)
            {
                Log("无法移动 " + relative + "：" + error.Message);
                return false;
            }
        }
        return true;
    }

    private bool IsNewer(string before, string after)
    {
        return before.Length > 0 && after.Length > 0 && !String.Equals(before, after, StringComparison.OrdinalIgnoreCase);
    }

    // 一键更新：fetch → 备份本地源码 → 快进合并 → 还原本地源码 → 重启。
    private async Task<bool> UpdateSiteAsync(bool openBrowser)
    {
        if (busy || closing) return false;
        busy = true;
        bool succeeded = false;
        bool restartAllowed = true;
        GitUpdateBackup localBackup = null;
        Exception updateError = null;
        updateNetworkFailure = false;
        update.Text = "正在更新…";
        update.Enabled = false;
        start.Enabled = browse.Enabled = false;
        stop.Enabled = running;
        state.ForeColor = gold;
        state.Text = "正在更新 · 正在拉取 GitHub 最新代码";
        try
        {
            if (running) StopSite();
            string git = FindGit();
            var head = await Task.Run(delegate { return Git(git, "--no-pager rev-parse HEAD", false); });
            string before = head.Output.Trim();
            if (head.ExitCode != 0 || before.Length == 0) throw new InvalidOperationException("无法读取当前版本，请确认项目目录是完整的 Git 仓库。");
            Log("正在从 GitHub 获取最新代码…");
            var fetch = await Task.Run(delegate { return Git(git, "-c core.quotepath=false --no-pager fetch", true); });
            if (fetch.ExitCode != 0) throw new Exception(UpdateFailureHint(fetch.Output, fetch.ExitCode));
            var upstream = await Task.Run(delegate { return Git(git, "--no-pager rev-parse --verify \"@{upstream}\"", false); });
            if (upstream.ExitCode != 0) throw new Exception("当前分支未配置远端更新分支，更新未执行。");
            if (upstream.Output.Trim() != before)
            {
                localBackup = new GitUpdateBackup(
                    delegate(string arguments) { return Git(git, arguments, true); }, Log,
                    Path.Combine(root, "launcher", "update-backups"));
                await Task.Run(delegate { localBackup.Prepare(before); });
            }
            var pull = await Task.Run(delegate { return Git(git, "-c core.quotepath=false --no-pager merge --ff-only \"@{upstream}\"", true); });
            if (pull.ExitCode != 0 && pull.Output.IndexOf("untracked working tree files would be overwritten", StringComparison.OrdinalIgnoreCase) >= 0)
            {
                string backupName;
                if (TryBackupBlockingFiles(pull.Output, out backupName))
                {
                    Log("已把阻挡更新的本机文件移到 " + backupName + "，正在重试…");
                    pull = await Task.Run(delegate { return Git(git, "-c core.quotepath=false --no-pager merge --ff-only \"@{upstream}\"", true); });
                }
            }
            if (pull.ExitCode != 0) throw new Exception(UpdateFailureHint(pull.Output, pull.ExitCode));
            if (localBackup != null) await Task.Run(delegate { localBackup.Reapply(); });
            var head2 = await Task.Run(delegate { return Git(git, "--no-pager rev-parse HEAD", false); });
            string after = head2.ExitCode == 0 && head2.Output.Trim().Length > 0 ? head2.Output.Trim() : before;
            if (!IsNewer(before, after))
            {
                Log("已是最新版本，无需更新。");
                state.Text = "已是最新版本 · 正在重新启动网站";
            }
            else
            {
                var count = await Task.Run(delegate { return Git(git, "--no-pager rev-list --count " + before + ".." + after, false); });
                var summary = await Task.Run(delegate { return Git(git, "--no-pager log -1 --date=short --format=\"%h · %ad · %s\"", false); });
                var stat = await Task.Run(delegate { return Git(git, "--no-pager diff --stat " + before + " " + after, false); });
                Log("更新完成，共 " + count.Output.Trim() + " 个新提交。最新提交：" + summary.Output.Trim());
                LogBlock(stat.Output);
                state.Text = "更新完成 · 正在检查依赖并重启网站";
                var changed = await Task.Run(delegate { return Git(git, "--no-pager diff --name-only " + before + " " + after + " -- package.json package-lock.json bun.lock pnpm-lock.yaml yarn.lock", false); });
                if (changed.Output.Trim().Length > 0)
                {
                    Log("依赖清单有变化，正在运行 npm install…");
                    if (!await InstallDependenciesAsync()) throw new Exception("依赖准备未完成，更新已中止。");
                }
            }
            succeeded = true;
        }
        catch (Exception error)
        {
            Log(error.Message);
            updateError = error;
            state.ForeColor = danger;
            state.Text = !restartAllowed ? "更新失败 · 备份已保留，服务暂未启动" :
                updateNetworkFailure ? "更新失败 · 无法连接 GitHub" : "更新失败 · 已恢复原版本和本地修改";
        }
        // C# 5 cannot await inside catch; restore before unlocking the update controls.
        if (updateError != null && localBackup != null)
        {
            try { restartAllowed = await Task.Run(delegate { return localBackup.Rollback(); }); }
            catch (Exception restoreError) { restartAllowed = false; Log("恢复失败：" + restoreError.Message); }
            if (!restartAllowed) state.Text = "更新失败 · 备份已保留，服务暂未启动";
        }
        busy = false;
        if (!closing)
        {
            update.Text = UpdateCaption;
            update.Enabled = true;
            start.Enabled = !running;
            stop.Enabled = running;
        }
        if (!closing && restartAllowed)
        {
            bool started = await StartSiteAsync(openBrowser);
            await RefreshVersionAsync();
            if (!succeeded && started)
            {
                state.ForeColor = danger;
                state.Text = updateNetworkFailure ? "更新失败 · 无法连接 GitHub（网站已重启）" : "更新失败 · 已保持原版本（网站已重启）";
            }
        }
        return succeeded;
    }

    private async Task RefreshVersionAsync()
    {
        string text;
        try
        {
            string git = FindGit();
            var log = await Task.Run(delegate { return Git(git, "--no-pager log -1 --date=short --format=\"%h · %ad · %s\"", false); });
            text = log.ExitCode == 0 && log.Output.Trim().Length > 0 ? "当前版本：" + log.Output.Trim() : "当前版本：未读取到 Git 版本信息";
        }
        catch (InvalidOperationException)
        {
            text = "当前版本：未检测到 Git，无法一键更新";
        }
        SetVersion(text);
    }

    private void SetVersion(string text)
    {
        if (closing || IsDisposed) return;
        if (InvokeRequired)
        {
            try { BeginInvoke(new Action<string>(SetVersion), text); } catch (InvalidOperationException) { }
            return;
        }
        versionLabel.Text = text;
    }

    private static int FreePort()
    {
        for (int port = 3000; port <= 3099; port++)
        {
            var listener = new TcpListener(IPAddress.Any, port);
            try { listener.Start(); return port; }
            catch (SocketException) { }
            finally { listener.Stop(); }
        }
        throw new InvalidOperationException("3000–3099 端口均被占用，请关闭其他服务后重试。");
    }

    private static string GetPage(string target)
    {
        var request = (HttpWebRequest)WebRequest.Create(target);
        request.Timeout = request.ReadWriteTimeout = 1500;
        request.Proxy = null;
        using (var response = request.GetResponse())
        using (var reader = new StreamReader(response.GetResponseStream(), Encoding.UTF8)) return reader.ReadToEnd();
    }

    private async Task<bool> InstallDependenciesAsync()
    {
        string node = FindNode();
        string npm = Path.Combine(Path.GetDirectoryName(node), "node_modules", "npm", "bin", "npm-cli.js");
        if (!File.Exists(npm)) throw new InvalidOperationException("未找到 npm，请重新安装包含 npm 的 Node.js。");
        var install = Launch(node, "\"" + npm + "\" install --no-audit --no-fund", 0);
        int exit = await Task.Run(delegate { install.WaitForExit(); return install.ExitCode; });
        if (closing || child != install) return false;
        child = null;
        install.Dispose();
        if (exit != 0) throw new InvalidOperationException("依赖安装失败，请检查网络。详情见运行日志。");
        return true;
    }

    private async Task<bool> StartSiteAsync(bool openBrowser)
    {
        if (busy || running || closing) return running;
        busy = true;
        start.Text = "正在启动…";
        start.Enabled = browse.Enabled = update.Enabled = false;
        stop.Enabled = true;
        state.ForeColor = gold;
        try
        {
            if (!File.Exists(Path.Combine(root, "server.ts")) || !File.Exists(Path.Combine(root, "package.json")))
                throw new InvalidOperationException("请将启动器放在网站项目根目录，与 server.ts、package.json 放在一起。");
            string node = FindNode();
            if (!File.Exists(Path.Combine(root, "node_modules", "tsx", "package.json")) ||
                !File.Exists(Path.Combine(root, "node_modules", "vite", "package.json")))
            {
                state.Text = "首次准备 · 正在安装依赖";
                Log("正在运行 npm install，请稍候…");
                if (!await InstallDependenciesAsync()) return false;
            }
            int port = FreePort();
            url = "http://localhost:" + port;
            address.Text = url;
            state.Text = "正在启动网站…";
            Log("启动项目：" + root);
            Log("本地地址：" + url);
            var server = Launch(node, "--import tsx server.ts", port);
            string health = null;
            var watch = Stopwatch.StartNew();
            while (watch.Elapsed < TimeSpan.FromSeconds(90))
            {
                if (closing || child != server) return false;
                if (server.HasExited) throw new InvalidOperationException("网站进程已退出，退出码 " + server.ExitCode + "。请查看日志后重试。");
                health = await Task.Run(delegate {
                    try { return GetPage(url + "/api/health"); }
                    catch (WebException) { return null; }
                });
                if (health != null && health.Contains("\"status\":\"ok\"")) break;
                await Task.Delay(350);
            }
            if (closing || child != server) return false;
            if (health == null || !health.Contains("\"status\":\"ok\""))
                throw new InvalidOperationException("启动超时，请查看日志并重新启动。");
            running = true;
            state.Text = "● 网站正在运行";
            state.ForeColor = Color.FromArgb(89, 209, 159);
            mode.Text = health.Contains("\"hasApiKey\":true") ? "AI 密钥已配置 · 网站已就绪" : "本地规则模式 · 配置 Gemini 密钥后可启用 AI";
            browse.Enabled = true;
            Log("网站已就绪。关闭启动器会自动停止服务。");
            if (openBrowser) OpenWebsite();
            return true;
        }
        catch (Exception error)
        {
            StopSite();
            state.Text = "启动失败 · 请查看日志";
            state.ForeColor = danger;
            Log(error.Message);
            return false;
        }
        finally
        {
            busy = false;
            if (!closing) { start.Enabled = !running; stop.Enabled = running; update.Enabled = true; start.Text = running ? "已启动" : "启动网站"; }
        }
    }

    private void OpenWebsite()
    {
        if (!running) return;
        try { Process.Start(new ProcessStartInfo(url) { UseShellExecute = true }); }
        catch (Exception error) { Log("无法打开浏览器，请手动访问 " + url + "：" + error.Message); }
    }

    private void StopSite()
    {
        var process = child;
        child = null;
        running = false;
        start.Text = "启动网站";
        browse.Enabled = stop.Enabled = false;
        start.Enabled = !busy;
        if (process != null)
        {
            try
            {
                if (!process.HasExited)
                {
                    using (var killer = Process.Start(new ProcessStartInfo {
                        FileName = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), "taskkill.exe"),
                        Arguments = "/PID " + process.Id + " /T /F", UseShellExecute = false, CreateNoWindow = true
                    })) killer.WaitForExit(5000);
                    if (!process.WaitForExit(2000)) Log("停止服务超时，请检查运行日志。");
                }
            }
            catch (Exception error) { Log("停止服务时遇到问题：" + error.Message); }
            finally { process.Dispose(); }
        }
        if (!closing)
        {
            state.Text = "服务已停止";
            state.ForeColor = muted;
            mode.Text = "点击启动网站即可继续使用";
            Log("服务已停止。");
        }
    }

    private async Task RunSelfTestAsync()
    {
        string report = Path.Combine(root, "launcher", "self-test.txt");
        TcpListener occupied = null;
        string note = "";
        try
        {
            occupied = new TcpListener(IPAddress.Any, 3000);
            try { occupied.Start(); } catch (SocketException) { occupied.Stop(); occupied = null; }
            if (!await StartSiteAsync(false)) throw new Exception("启动失败：" + output.Text);
            if (occupied != null && url.EndsWith(":3000")) throw new Exception("未避开被占用的端口");
            string page = await Task.Run(delegate { return GetPage(url); });
            if (!page.Contains("/src/main.tsx")) throw new Exception("网站首页内容异常");
            string liveUrl = url;
            using (var bitmap = new Bitmap(Width, Height))
            { DrawToBitmap(bitmap, new Rectangle(0, 0, Width, Height)); bitmap.Save(Path.Combine(root, "launcher", "preview.png")); }
            int pid = child.Id;
            StopSite();
            await Task.Delay(500);
            try { Process.GetProcessById(pid); throw new Exception("停止后网站进程仍然存在"); }
            catch (ArgumentException) { }
            try { GetPage(liveUrl + "/api/health"); throw new Exception("停止后网站仍在响应"); }
            catch (WebException) { }
            if (!await StartSiteAsync(false)) throw new Exception("重新启动失败");
            StopSite();
            FindGit();
            if (UpdateCaption != update.Text) throw new Exception("一键更新按钮未就绪");
            if (!update.Enabled) throw new Exception("一键更新按钮被禁用");
            if (!await UpdateSiteAsync(false))
            {
                if (!updateNetworkFailure) throw new Exception("一键更新失败：" + output.Text);
                note = "、一键更新已跳过（无法连接 GitHub）";
            }
            else note = "、一键更新";
            StopSite();
            await RefreshVersionAsync();
            if (versionLabel.Text.IndexOf("未检测到 Git") >= 0 || versionLabel.Text.IndexOf("未读取到") >= 0)
                throw new Exception("版本信息未读取：" + versionLabel.Text);
            File.WriteAllText(report, "PASS: automatic start, health, homepage, occupied-port fallback, GUI render, process-tree stop, restart" + note + ".\r\nURL: " + liveUrl + "\r\n" + versionLabel.Text, Encoding.UTF8);
            Environment.ExitCode = 0;
        }
        catch (Exception error)
        {
            File.WriteAllText(report, "FAIL: " + error, Encoding.UTF8);
            Environment.ExitCode = 1;
        }
        finally { if (occupied != null) occupied.Stop(); Close(); }
    }
}
