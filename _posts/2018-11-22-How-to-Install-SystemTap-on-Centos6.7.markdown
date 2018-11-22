---
layout: post
title:  "如何Centos6.7上安装SystemTap"
date:   2018-11-22 17:55:45 +0800
categories: NGINX
---
## 如何Centos6.7上安装SystemTap
### 什么是SystemTap

### 安装步骤
* 安装SystemTap
```shellcode
  yum install systemtap systemtap-runtime
  stap-prep
```
* 安装内核调试信息
```shellcode
  yum install kernel-devel
  debuginfo-install kernel-devel
```
如何安装不成功，找不到相应的包，需要先修改“/etc/yum.repos.d/CentOS-Debuginfo.repo”文件的enable=1；

* 验证安装
```shellcode
stap -v -e 'probe vfs.read {printf("read performed\n"); exit()}'
```
### 
