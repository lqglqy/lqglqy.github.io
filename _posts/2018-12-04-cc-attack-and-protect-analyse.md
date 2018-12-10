# 什么是CC攻击

CC（Challenge Collapsar）原意是挑战黑洞，黑洞是绿盟科技的一款抗分布式拒绝服务攻击产品，因其在抗WEB分布式拒绝服务攻击能力较为出色。因此，用向黑洞发起挑战代指WEB服务的分布式拒绝服务攻击。该攻击与我们常见的DDOS（网络层分布式拒绝服务攻击）不同之处在于，CC攻击导致的结果是只会导致WEB服务或者只是WEB服务中的某一接口或单一页面无法服务，相比网络层的拒绝服务攻击，其优势在于能够使用相对较少的资源对更为精确的目标进行攻击。

# 攻击方式

攻击方式主要有两种，一种是快速请求服务器处理消耗较大的页面或者接口，这种方式是通过大量占用服务器的CPU、IO等资源，致使服务器无法正常响应其它用户的请求。另一种是相对的慢速攻击，这种攻击是通过与服务器建立连接后，以最慢的速度发送请求/读取响应，通过占用服务器的进程、线程、网络套接字等资源，达到导致服务器无法继续服务的目的，这种攻击一般针对Apache、httpd这类thread-base架构的服务器。

# 防护手段

针对两种不同类型的攻击防护方式分别是：
+ 快速攻击：限制单一源IP的请求速率、限制并发连接数；
+ 慢速攻击：限制单一请求的超时时间；

Nginx和Apache都有相应的模块来解决这类问题，只要配置得当能够抵挡住大多数的CC攻击，以下我们以Nginx为例看看具体的配置：

限制单一源IP的请求速率，平均每秒不超过1个请求，并且突发不超过5个请求：
```
http {
    limit_req_zone $binary_remote_addr zone=one:10m rate=1r/s;
    ...
    server {
        ...
        location /limit_req/ {
            limit_req zone=one burst=5;
        }
}
```

限制并发连接数，单一源IP最大并发数是100，总的连接数不超过1000：
```
http {
    limit_conn_zone $binary_remote_addr zone=one:10m;
    limit_conn_zone $server_name zone=perserver:10m;
    ...
    server {
        ...
        limit_conn  one  100;                                              
        limit_conn perserver 1000;
        ...
}
```

限制单个请求的超时时间：
```
http {
    ...
    server {
        ...
        client_header_timeout 60s; //等待客户端发送请求头的超时时间，将这个值改小可以应对慢速发送请求头的CC攻击；
        client_body_timeout   60s; //读取客户端发送请求体的超时时间，将这个值改小可以应对慢速发送请求体的CC攻击；
        keepalive_timeout     75s; //与客户端的连接超时时间，如果连接大量被占用，可以将其改小一些，释放被占用的连接，减轻服务器压力；
        ...
}
```


# 滴滴云WAF防CC配置

目前使用较多的CC攻击还是以快速攻击为主，因为慢速攻击同样要消耗大量的客户端资源，除非有大量肉鸡做为攻击源。针对较为流行的快速CC攻击，滴滴云WAF提供了一套简单易用的防护方案，用户只要根据需要输入几个参数，即可实现快速的CC防护能力部署，不需要掌握不同服务器的不同防护模块的配置方法，省时省力又省心！

以下是现有的防护配置页面，仅供参考：

<img src="/assets/waf_cc_config.png" width=521 height=672 />
![cc](/assets/waf_cc_config.png "cc" width=521 height=672)
