# -*- coding: utf-8 -*-
from pathlib import Path
Path('data/_utf8_test.txt').write_text('中文测试：水纹月牙剑气', encoding='utf-8')
