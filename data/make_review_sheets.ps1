Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies ([System.Drawing.Image].Assembly.Location) -TypeDefinition @"
using System;
using System.IO;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Collections.Generic;
using System.Linq;
public class SheetMaker {
 public static void Make(string root,string outdir) {
  Directory.CreateDirectory(outdir);
  var font=new Font("Microsoft YaHei",15);var small=new Font("Microsoft YaHei",9); 
  var entries=new List<Tuple<int,string[],string>>();
  for(int n=168;n<=334;n++) { string d=Path.Combine(root,n.ToString("D4")); string[] ps=Directory.Exists(d)?Directory.GetFiles(d,"effect*.png").OrderBy(x=>x).ToArray():new string[0];
    var names=new List<string>(); if(Directory.Exists(d)) foreach(var a in Directory.GetFiles(d,"effect*.atlas")) {var l=File.ReadAllLines(a);for(int i=0;i+1<l.Length;i++){var s=l[i].Trim(); if(s.Length>0&&!s.Contains(":")&&!s.EndsWith(".png")&&l[i+1].Contains(":")) names.Add(s);}}
    entries.Add(Tuple.Create(n,ps,String.Join("; ",names.Take(10))));
  }
  File.WriteAllLines(Path.Combine(outdir,"index.txt"),entries.Select(e=>e.Item1.ToString("D4")+"\t"+(e.Item2.Length>0?String.Join("+",e.Item2.Select(Path.GetFileName)):"MISSING")+"\t"+e.Item3));
  for(int st=0;st<entries.Count;st+=20) {var b=entries.Skip(st).Take(20).ToList(); int cw=340,ch=295,cols=4,rows=5;using(var bmp=new Bitmap(cols*cw,rows*ch))using(var g=Graphics.FromImage(bmp)) {g.InterpolationMode=InterpolationMode.HighQualityBicubic;g.Clear(Color.FromArgb(36,38,44));
    for(int j=0;j<b.Count;j++){var e=b[j];int x=(j%cols)*cw,y=(j/cols)*ch;using(var bg=new SolidBrush(Color.FromArgb(19,21,26)))using(var pen=new Pen(Color.FromArgb(96,101,112))) {g.FillRectangle(bg,x,y,cw-2,ch-2);g.DrawRectangle(pen,x,y,cw-2,ch-2);} var pname=e.Item2.Length>0?String.Join("+",e.Item2.Select(Path.GetFileName)):"MISSING";g.DrawString(e.Item1.ToString("D4")+"  "+pname,font,Brushes.White,x+7,y+5);
      int px=x+8,py=y+31,pw=cw-16,ph=207;using(var b1=new SolidBrush(Color.FromArgb(72,72,72)))using(var b2=new SolidBrush(Color.FromArgb(55,55,55))){for(int cy=py;cy<py+ph;cy+=12)for(int cx=px;cx<px+pw;cx+=12)g.FillRectangle((((cx-px)/12+(cy-py)/12)%2==0)?b1:b2,cx,cy,12,12);}
      var ims=new List<Image>();try{foreach(var p in e.Item2)ims.Add(Image.FromFile(p));if(ims.Count>0){float tw=ims.Sum(im=>im.Width),th=ims.Max(im=>im.Height),sc=Math.Min(pw/tw,ph/th),xx=px+(pw-tw*sc)/2f;foreach(var im in ims){float iw=im.Width*sc,ih=im.Height*sc;g.DrawImage(im,xx,py+(ph-ih)/2f,iw,ih);xx+=iw;}}}catch{}finally{foreach(var im in ims)im.Dispose();}
      var r=new RectangleF(x+8,y+244,cw-16,43);using(var sf=new StringFormat()){sf.Trimming=StringTrimming.EllipsisCharacter;g.DrawString(e.Item3,small,Brushes.LightGray,r,sf);}
    }
    bmp.Save(Path.Combine(outdir,String.Format("sheet_{0:D2}_{1:D4}_{2:D4}.jpg",st/20+1,b[0].Item1,b[b.Count-1].Item1)),ImageFormat.Jpeg);
  }}
 }
}
"@
[SheetMaker]::Make('D:\迅雷下载\特效500个【spine】\特效500个【spine】',(Join-Path $PWD 'data\_label_review_0168_0334'))

