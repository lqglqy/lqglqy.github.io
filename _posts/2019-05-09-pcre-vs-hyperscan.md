---
layout: post
title:  "pcre VS hyperscan"
date:   2019-05-09 18:37:00 +0800
categories: match
---

# 背景介绍
	在检测引擎中常用到正则匹配，一般情况下使用pcre即可满足，但当规则量达到
	千条级别时pcre性能明显下降，因此，可考虑用hyperscan替代pcre，下文主要
	是通过测试验证替代带来的收益和一些小问题。

# 测试结果及分析
![pcreVShs](/assets/pcre_vs_hyperscan.png){:height="672px" width="521px"}

    从以上结果中分析得知：
    1.hyperscan性能优于pcre；
    2.pcre由于是串行匹配多条规则，因此会随着规则数的增加，性能线性下降，
    hyperscan则不会；
    3.匹配最后一条规则时性能较不匹配要低；
    4.hyperscan占用的静态空间和动态空间都会大于pcre；

# 测试方法说明
    1.规则数按10、100、1000分布；
    2.分别统计匹配耗时输出到文件；
    3.每轮测试发送1000条请求；
    4.统计输出耗时的平均值；

# 参考
* https://blog.chaitin.cn/sqlchop-the-sqli-detection-engine/



