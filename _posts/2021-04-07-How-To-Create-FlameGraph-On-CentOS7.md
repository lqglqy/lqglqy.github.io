# 如何在Centos7上生成火焰图
## 1.安装systemtap ——root权限下安装

```
yum install systemtap systemtap-runtime
stap-prep #安装kernel debug包
```

如果安装失败，需要手动下载安装包
```
kernel-devel
wget http://vault.centos.org/7.6.1810/updates/x86_64/Packages/kernel-devel-3.10.0-957.21.3.el7.x86_64.rpm
debug info 下载
http://debuginfo.centos.org/7/x86_64/

#wget http://debuginfo.centos.org/7/x86_64/kernel-debuginfo-3.10.0-957.21.3.el7.x86_64.rpm
#wget http://debuginfo.centos.org/7/x86_64/kernel-debuginfo-common-x86_64-3.10.0-957.21.3.el7.x86_64.rpm

#速度快
wget http://mirrors.ocf.berkeley.edu/centos-debuginfo/7/x86_64/kernel-debuginfo-3.10.0-957.21.3.el7.x86_64.rpm
wget http://mirrors.ocf.berkeley.edu/centos-debuginfo/7/x86_64/kernel-debuginfo-common-x86_64-3.10.0-957.21.3.el7.x86_64.rpm

安装
rpm -ivh kernel-devel-3.10.0-957.21.3.el7.x86_64.rpm
rpm -ivh kernel-debuginfo-common-x86_64-3.10.0-957.21.3.el7.x86_64.rpm
rpm -ivh kernel-debuginfo-3.10.0-957.21.3.el7.x86_64.rpm
```

## 2.安装火焰图生成工具

```
git clone https://github.com/openresty/nginx-systemtap-toolkit
git clone https://github.com/brendangregg/FlameGraph.git
git clone https://github.com/openresty/stapxx.git
```

## 3.生成命令
```
./genflame.sh c $pid $name

#!/bin/sh

if [ $# -ne 3 ]
then
        echo "Usage: ./`basename $0` lua/c PID NAME"
        exit
fi

pid=$2
name=$3

if [ $1 == "lua" ]
then
        /opt/nginx-systemtap-toolkit/ngx-sample-lua-bt -p $pid --luajit20 -t 30 >temp.bt
        /opt/nginx-systemtap-toolkit/fix-lua-bt temp.bt >${name}.bt
elif [ $1 == "c" ]
then
        /opt/nginx-systemtap-toolkit/sample-bt -p $pid -t 10 -u > ${name}.bt
else
        echo "type is only lua/c"
        exit
fi

/opt/FlameGraph/stackcollapse-stap.pl ${name}.bt >${name}.cbt
/opt/FlameGraph/flamegraph.pl ${name}.cbt >${name}.svg
rm -f temp.bt ${name}.bt ${name}.cbt
```

## QA: Kong lua 火焰图生成失败

一、可能是libluajit.so没有debug，可以通过file libluajit.so 查看是否有not striped确认，没有该标识说明没有debug，那么需要重新编译luajit对应版本安装即可；

二、可能是openresty/nginx编译时没有--without-luajit-gc64 选项，由于工具是32位的，因此，要将默认的64位关掉；

        https://docs.konghq.com/install/source/ 通过这里的安装方法重新编译openresty，修改编译脚本带上该标识后，替换nginx即可；
