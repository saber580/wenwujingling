# -*- coding: utf-8 -*-
"""技术文档 docx -> pdf 导出（更新目录域后导出，并回报页数）。

用法：
    python tools/export_techdoc_pdf.py [docx路径]

不传参数时默认导出桌面的最新交付版。Word COM 导出前必须先删旧 PDF，
否则 Word 会以「只读文件」为由拒绝保存。
"""
import os
import sys

DOCX_DEFAULT = r"C:/Users/lenovo/Desktop/文物精灵网站/01-技术文档-文物精灵-v1.19.docx"


def main():
    docx_path = sys.argv[1] if len(sys.argv) > 1 else DOCX_DEFAULT
    docx_path = os.path.abspath(docx_path).replace("\\", "/")
    if not os.path.exists(docx_path):
        sys.exit("找不到 docx：" + docx_path)

    pdf_path = os.path.splitext(docx_path)[0] + ".pdf"
    if os.path.exists(pdf_path):
        os.remove(pdf_path)

    import win32com.client as win32

    word = win32.Dispatch("Word.Application")
    word.Visible = False
    word.DisplayAlerts = 0
    try:
        doc = word.Documents.Open(docx_path)
        # 目录与域都更新两轮，否则二级标题可能残留旧页码
        for toc in doc.TablesOfContents:
            toc.Update()
        for story in doc.StoryRanges:
            try:
                story.Fields.Update()
            except Exception:
                pass
        for toc in doc.TablesOfContents:
            toc.Update()
        doc.Save()
        doc.ExportAsFixedFormat(pdf_path, 17)     # 17 = wdExportFormatPDF
        pages = doc.ComputeStatistics(2)          # 2  = wdStatisticPages
        doc.Close(False)
    finally:
        word.Quit()

    print("页数:", pages)
    print("PDF :", pdf_path, os.path.getsize(pdf_path), "字节")
    if pages > 30:
        print("⚠️ 超过赛程 30 页上限")


if __name__ == "__main__":
    main()
