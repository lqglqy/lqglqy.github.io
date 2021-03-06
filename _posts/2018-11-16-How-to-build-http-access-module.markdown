---
layout: post
title:  "如何实现高效的HTTP精准访问控制功能"
date:   2018-11-20 17:07:00 +0800
categories: Code
---
### 什么是HTTP精准访问控制
  这是WAF(Web Application Firewall)的一个基本功能，主要目的是能够通过IP及HTTP协议的各字段组合，来实现精确的HTTP请求匹配功能，再通过阻断、放行、只记录日志三种相应动作来实现控制能力。

### 实现原理
* 解析
  * 解析请求行、参数、头，将Method、URI、Querys、Headers和字段以字段名为关键字存入hash表中。
  * 解码主要是将URI做URL解码。
  * 实现可以参考Nginx的解析实现：ngx_http_parse_request_line ngx_http_parse_header_line ngx_hash_t 等。

* 匹配
  1. 链式
    ![链式匹配](/assets/List_match.png "链式匹配图")
    * 整个数据结构是一个大的数组，数组中的每个元素是一条规则；
    * 多条规则组合成一条策略，Action不为none的规则代表一条策略的结束；
    * Next字段指向下一条策略的起始规则，匹配失败时由此快速跳转；
    * 由数组起始位置开始匹配；
    * 链式匹配主要特点是结构简洁，易实现、易维护，其缺点就是在策略、规则数转多时（超过1000条）性能下降明显。
    因此，需要一种更好的数据结构，来支持大量规则情况下的匹配；

  2. 树型
    * 把规则按字段分别组成多棵树，按树型结构来匹配能够大大提高匹配性能；
    ![树型匹配](/assets/Tree_match.png "树型匹配图")
    * 以IP为根结点构建一棵树；
    * 每条策略的除每一条规则外的其它规则，依次做为子结点挂到树上；
    * 匹配时利用深度遍历到各结点进行匹配，命中策略即返回；
      * 1.优化IP查找
      * 多个IP同时匹配可以考虑用Hash，但由于需要支持CDR格式（即：支持IP+MASK 10.1.0.0/16），
        因此采用Nginx中提供的radix_tree结构，具体实现和使用可参考ngx_radix_tree.c；
      * 2.优化字段串查找
      * 当遇到一个树节点上有多个字符串同时进行匹配时，需要用到多模式串匹配算法如AC+BM 或 SBOM等；
