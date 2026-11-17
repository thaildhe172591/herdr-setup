// Saves the clipboard's image for the composer's attachment tray: clip-image.exe <outDir>
// Prints the saved PNG's full path (or, for image files copied in Explorer, copies of them), nothing when the
// clipboard holds no image. Also removes tray files older than 7 days. Same output as clip-image.ps1, without
// PowerShell's 1-2 s start.
using System;
using System.Drawing.Imaging;
using System.IO;
using System.Text.RegularExpressions;
using System.Windows.Forms;

static class ClipImage {
    [STAThread]
    static int Main(string[] args) {
        if (args.Length < 1) return 2; // no folder: the composer only checks it runs
        Console.OutputEncoding = new System.Text.UTF8Encoding(false); // the composer reads UTF-8 (file names with accents)
        string dir = args[0];
        Directory.CreateDirectory(dir);
        string stamp = DateTime.Now.ToString("yyyyMMdd-HHmmss");
        var img = Clipboard.GetImage();
        if (img != null) {
            string path = Path.Combine(dir, "clip-" + stamp + ".png");
            img.Save(path, ImageFormat.Png);
            Console.WriteLine(path);
        } else {
            int i = 0;
            foreach (string f in Clipboard.GetFileDropList()) {
                if (!Regex.IsMatch(f, @"\.(png|jpe?g|gif|webp|bmp)$", RegexOptions.IgnoreCase)) continue;
                string dest = Path.Combine(dir, "file-" + stamp + "-" + i + "-" + Path.GetFileName(f));
                File.Copy(f, dest, true);
                File.SetLastWriteTime(dest, DateTime.Now); // fresh, so the 7-day cleanup keeps it
                Console.WriteLine(dest); i++;
            }
        }
        // Cleanup after the answer is out: the paste never waits for it.
        Console.Out.Flush();
        foreach (string f in Directory.GetFiles(dir))
            try { if (File.GetLastWriteTime(f) < DateTime.Now.AddDays(-7)) File.Delete(f); } catch { }
        return 0;
    }
}
