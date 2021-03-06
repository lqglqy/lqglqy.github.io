---
layout: post
title:  "当前流行的sql注入检测方式学习总结"
date:   2019-05-07 16:19:00 +0800
categories: Attack&Detect
---

# 什么是sql注入攻击

    我理解的sql注入攻击，是通过精心构造的输入内容，利用逻辑层与数据层交互间的逻辑缺陷，执行命令以实现数据获取、篡改、系统攻击等。


# sql注入攻击检测方式

* 特征检测
* 机器学习检测
* 语法分析


# 语法分析

    重点说明语法分析，是由于特征检测和机器学习都有局限性，主要表现在特征覆盖不全，和机器学习的流量变化不规律，无法做到准确率与召回率达到90%以上的水平，因此，才引出最近流行的语法分析方式，该方式的起源是由libinjection在2012年的hackhat大会上提出的一套实现思路，以下分析一下libinjection与长亭的sqlchop的实现思路。

    * libinjection 的思路是将输入转换为语法特征，与之前构造好的语法特征库进行比对，目前特征库有8K+条，在覆盖率方面有优势，同时匹配时用二分法查找，较之字符串的特征匹配性能也不会随着特征库的变大而有较大下降；

    * sqlchop 是在libinjection的基础之上产品化的一种实现，其核心在于能够识别输入是否为sql语句的一个子串，并辅以打分机制，以灵活的方式实现更为精准的检测机制。其核心竞争力主要在于对sql语法的实现完整分析与性能优化方面所做的努力；

# 总结

    以上主要是总结最近对于sql注入检测学习过程中的一些思考总结，具体的实现原理可从参考文章部分查看，本文不再赘述；


# 参考
* https://blog.chaitin.cn/sqlchop-the-sqli-detection-engine/
* https://www.freebuf.com/articles/web/170930.html



