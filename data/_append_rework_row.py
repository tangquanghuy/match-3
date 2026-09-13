# -*- coding: utf-8 -*-
import csv
from pathlib import Path
p=Path('data/spine_effect_rework_0051_0060.csv')
row=['0060','effect_skill2_shifa.png','施法者前方','复合类','弯月水刃聚形+扇状白光爆闪','月牙形+扇形+不规则能量团+椭圆形','水+光','流体刃面+乳白喷流+蓝色光膜+高亮边线','细薄白色水丝围拢→粗月牙水刃与团状蓝光形成主体→右上和中央的白蓝扇状闪光向外张开','中型','亮蓝+冰白','深蓝+浅青','粗月牙水刃+细白水丝+扇状爆闪+团状蓝光+小椭圆水滴','这张图的月牙水刃比0056更厚、更短，内侧白色高光占据大面积；上方和右侧增加了多段乳白色细水丝，右上是一块带长尖角的白蓝爆闪，中央则有边缘起伏的团状蓝光。','水系施法+弯月连击+爆闪起手+前方能量聚形']
with p.open('r',encoding='utf-8-sig',newline='') as f: rows=list(csv.reader(f))
assert [r[0] for r in rows[1:]]==[f'{i:04d}' for i in range(51,60)]; rows.append(row)
with p.open('w',encoding='utf-8-sig',newline='') as f: csv.writer(f).writerows(rows)
print('saved visible row 0060; total:',len(rows)-1)
