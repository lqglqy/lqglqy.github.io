---
layout: post
title:  "如何使NGINX提供模块配置的API接口"
date:   2018-11-16 11:35:45 +0800
categories: NGINX
---
# 如何使NGINX提供模块配置的API接口
## 为什么需要这个API接口？
  NGINX的模块化架构很适合增加一些扩展功能，但由于其更新配置时需要重新加载配置时需要重新生成工作进程，这种模式不适合频繁更新配置的要求，因此，考虑在NGINX中增加一个API的配置接口，用于接收配置并将其同步给各工作进程。
## 如何实现？
  接口考虑到易用性，对外提供HTTP REST API接口形式，配置文件格式采用JOSN格式。具体实现利用NGINX的HTTP协议解析能力，结合NGINX的多进程构架，在NGINX中启动一个单独的进程用于处理API接口，该进程只处理指定的配置请求。进程内部的处理流程包括配置变更和配置同步两个部分。下面是整体的处理架构图：
  ![架构图](/assets/config_api.png "架构图")
* 创建进程
  创建进程需要注意关闭其它Server的socket文件描述符，这块我的做法是通过配置文件指定API管理端口，将其它端口关闭，同时也需要在其它worker进程中将API的管理端口关闭。
  代码patch如下，以nginx 1.9.14为例：
  ```
  diff -Naru /usr/local/src/nginx-1.9.14/src/core/ngx_connection.c nginx-1.9.14/src/core/ngx_connection.c
  --- /usr/local/src/nginx-1.9.14/src/core/ngx_connection.c	2016-04-05 22:57:09.000000000 +0800
  +++ nginx-1.9.14/src/core/ngx_connection.c	2018-03-19 20:36:17.136280718 +0800
  @@ -954,9 +954,10 @@


   void
  -ngx_close_listening_sockets(ngx_cycle_t *cycle)
  +ngx_close_listening_sockets(ngx_cycle_t *cycle, char (*except_callback)(ngx_cycle_t *cycle, struct sockaddr *addr))
   {
       ngx_uint_t         i;
  +    ngx_uint_t         closed = 0;
       ngx_listening_t   *ls;
       ngx_connection_t  *c;

  @@ -969,7 +970,13 @@

       ls = cycle->listening.elts;
       for (i = 0; i < cycle->listening.nelts; i++) {
  +	if (except_callback && except_callback(cycle, ls[i].sockaddr)) {
  +		ngx_log_debug1(NGX_LOG_DEBUG_CORE, cycle->log, 0, "except port %d\n", ngx_inet_get_port(ls[i].sockaddr));
  +		continue;
  +	}

  +	ngx_log_debug1(NGX_LOG_DEBUG_CORE, cycle->log, 0, "close port %d\n", ngx_inet_get_port(ls[i].sockaddr));
  +	closed++;
           c = ls[i].connection;

           if (c) {
  @@ -1021,7 +1028,32 @@
           ls[i].fd = (ngx_socket_t) -1;
       }

  -    cycle->listening.nelts = 0;
  +    int count = cycle->listening.nelts;
  +
  +    for (i = 0; i<cycle->listening.nelts; i++) {
  +        ngx_log_debug2(NGX_LOG_DEBUG_CORE, cycle->log, 0,
  +                       "before move listening %V #%d ", &ls[i].addr_text, ls[i].fd);
  +    }
  +    i = 0;
  +    while(count--) {
  +	if (ls[i].fd == -1 && i < cycle->listening.nelts-1) {
  +		memmove((char *)&(ls[i]), (char*)&(ls[i+1]), sizeof(ngx_listening_t)*(cycle->listening.nelts-i-1));
  +		ngx_log_debug2(NGX_LOG_DEBUG_CORE, cycle->log, 0,
  +			       "move listening %V #%d ", &ls[i].addr_text, ls[i].fd);
  +	} else
  +		i++;
  +
  +	ngx_log_debug2(NGX_LOG_DEBUG_CORE, cycle->log, 0,
  +		       "after move listening %V #%d ", &ls[i].addr_text, ls[i].fd);
  +    }
  +
  +    cycle->listening.nelts -= closed;
  +
  +    ngx_log_debug1(NGX_LOG_DEBUG_CORE, cycle->log, 0, "port count %d\n", cycle->listening.nelts);
  +    for (i = 0; i<cycle->listening.nelts; i++) {
  +        ngx_log_debug2(NGX_LOG_DEBUG_CORE, cycle->log, 0,
  +                       "not close listening %V #%d ", &ls[i].addr_text, ls[i].fd);
  +    }
   }


  diff -Naru /usr/local/src/nginx-1.9.14/src/core/ngx_connection.h nginx-1.9.14/src/core/ngx_connection.h
  --- /usr/local/src/nginx-1.9.14/src/core/ngx_connection.h	2016-04-05 22:57:09.000000000 +0800
  +++ nginx-1.9.14/src/core/ngx_connection.h	2018-03-19 20:36:17.136280718 +0800
  @@ -217,7 +217,7 @@
   ngx_int_t ngx_set_inherited_sockets(ngx_cycle_t *cycle);
   ngx_int_t ngx_open_listening_sockets(ngx_cycle_t *cycle);
   void ngx_configure_listening_sockets(ngx_cycle_t *cycle);
  -void ngx_close_listening_sockets(ngx_cycle_t *cycle);
  +void ngx_close_listening_sockets(ngx_cycle_t *cycle, char (*except_callback)(ngx_cycle_t *cycle, struct sockaddr *addr));
   void ngx_close_connection(ngx_connection_t *c);
   void ngx_close_idle_connections(ngx_cycle_t *cycle);
   ngx_int_t ngx_connection_local_sockaddr(ngx_connection_t *c, ngx_str_t *s,
  diff -Naru /usr/local/src/nginx-1.9.14/src/core/ngx_inet.c nginx-1.9.14/src/core/ngx_inet.c
  --- /usr/local/src/nginx-1.9.14/src/core/ngx_inet.c	2016-04-05 22:57:09.000000000 +0800
  +++ nginx-1.9.14/src/core/ngx_inet.c	2018-03-19 20:36:17.137280748 +0800
  @@ -1275,3 +1275,30 @@

       return NGX_OK;
   }
  +
  +in_port_t
  +ngx_inet_get_port(struct sockaddr *sa)
  +{
  +    struct sockaddr_in   *sin;
  +#if (NGX_HAVE_INET6)
  +    struct sockaddr_in6  *sin6;
  +#endif
  +
  +    switch (sa->sa_family) {
  +
  +#if (NGX_HAVE_INET6)
  +    case AF_INET6:
  +        sin6 = (struct sockaddr_in6 *) sa;
  +        return ntohs(sin6->sin6_port);
  +#endif
  +
  +#if (NGX_HAVE_UNIX_DOMAIN)
  +    case AF_UNIX:
  +        return 0;
  +#endif
  +
  +    default: /* AF_INET */
  +        sin = (struct sockaddr_in *) sa;
  +        return ntohs(sin->sin_port);
  +    }
  +}
  diff -Naru /usr/local/src/nginx-1.9.14/src/core/ngx_inet.h nginx-1.9.14/src/core/ngx_inet.h
  --- /usr/local/src/nginx-1.9.14/src/core/ngx_inet.h	2016-04-05 22:57:09.000000000 +0800
  +++ nginx-1.9.14/src/core/ngx_inet.h	2018-03-19 20:36:17.137280748 +0800
  @@ -117,6 +117,6 @@
   ngx_int_t ngx_inet_resolve_host(ngx_pool_t *pool, ngx_url_t *u);
   ngx_int_t ngx_cmp_sockaddr(struct sockaddr *sa1, socklen_t slen1,
       struct sockaddr *sa2, socklen_t slen2, ngx_uint_t cmp_port);
  -
  +in_port_t ngx_inet_get_port(struct sockaddr *sa);

   #endif /* _NGX_INET_H_INCLUDED_ */
  diff -Naru /usr/local/src/nginx-1.9.14/src/os/unix/ngx_process_cycle.c nginx-1.9.14/src/os/unix/ngx_process_cycle.c
  --- /usr/local/src/nginx-1.9.14/src/os/unix/ngx_process_cycle.c	2016-04-05 22:57:10.000000000 +0800
  +++ nginx-1.9.14/src/os/unix/ngx_process_cycle.c	2018-03-27 20:32:07.013013332 +0800
  @@ -9,8 +9,10 @@
   #include <ngx_core.h>
   #include <ngx_event.h>
   #include <ngx_channel.h>
  +#include <ngx_stream_judge_module.h>

  -
  +static void
  +ngx_start_api_manager_process(ngx_cycle_t *cycle, ngx_uint_t respawn);
   static void ngx_start_worker_processes(ngx_cycle_t *cycle, ngx_int_t n,
       ngx_int_t type);
   static void ngx_start_cache_manager_processes(ngx_cycle_t *cycle,
  @@ -26,6 +28,8 @@
   static void ngx_cache_manager_process_cycle(ngx_cycle_t *cycle, void *data);
   static void ngx_cache_manager_process_handler(ngx_event_t *ev);
   static void ngx_cache_loader_process_handler(ngx_event_t *ev);
  +static char
  +ngx_worker_except_listening_cb(ngx_cycle_t *cycle, struct sockaddr *addr);


   ngx_uint_t    ngx_process;
  @@ -68,6 +72,8 @@
   static ngx_log_t        ngx_exit_log;
   static ngx_open_file_t  ngx_exit_log_file;

  +extern ngx_int_t
  +ngx_http_manager_api_v1_init_config(ngx_cycle_t *cycle);

   void
   ngx_master_process_cycle(ngx_cycle_t *cycle)
  @@ -125,10 +131,16 @@
       ngx_setproctitle(title);


  -    ccf = (ngx_core_conf_t *) ngx_get_conf(cycle->conf_ctx, ngx_core_module);
  -
  +    ccf = (ngx_core_conf_t *) ngx_get_conf(cycle->conf_ctx, ngx_core_module);
  +    ngx_int_t ret;
  +    ret = ngx_stream_judge_init_queue(cycle);
  +    if (ret != NGX_OK) {
  +	    ngx_log_error(NGX_LOG_ERR, cycle->log, 0, "[%s %d] init_judge_policy_queue() fail, exit.", __FUNCTION__, __LINE__);
  +	    exit(-1);
  +    }
       ngx_start_worker_processes(cycle, ccf->worker_processes,
  -                               NGX_PROCESS_RESPAWN);
  +			       NGX_PROCESS_RESPAWN);
  +    ngx_start_api_manager_process(cycle, 0);
       ngx_start_cache_manager_processes(cycle, 0);

       ngx_new_binary = 0;
  @@ -221,6 +233,7 @@
               ngx_reconfigure = 0;

               if (ngx_new_binary) {
  +	        ngx_start_api_manager_process(cycle, 0);
                   ngx_start_worker_processes(cycle, ccf->worker_processes,
                                              NGX_PROCESS_RESPAWN);
                   ngx_start_cache_manager_processes(cycle, 0);
  @@ -240,9 +253,11 @@
               ngx_cycle = cycle;
               ccf = (ngx_core_conf_t *) ngx_get_conf(cycle->conf_ctx,
                                                      ngx_core_module);
  -            ngx_start_worker_processes(cycle, ccf->worker_processes,
  +
  +	    ngx_start_worker_processes(cycle, ccf->worker_processes,
                                          NGX_PROCESS_JUST_RESPAWN);
               ngx_start_cache_manager_processes(cycle, 1);
  +	    ngx_start_api_manager_process(cycle, 1);

               /* allow new processes to start */
               ngx_msleep(100);
  @@ -256,6 +271,7 @@
               ngx_restart = 0;
               ngx_start_worker_processes(cycle, ccf->worker_processes,
                                          NGX_PROCESS_RESPAWN);
  +	    ngx_start_api_manager_process(cycle, 0);
               ngx_start_cache_manager_processes(cycle, 0);
               live = 1;
           }
  @@ -421,7 +437,112 @@

       ngx_pass_open_channel(cycle, &ch);
   }
  +extern in_port_t ngx_http_manager_api_v1_listen_port;
  +static int have_api_port = 0;
  +static char
  +ngx_manager_except_listening_cb(ngx_cycle_t *cycle, struct sockaddr *addr)
  +{
  +	if (addr &&
  +	    ngx_inet_get_port(addr) == ngx_http_manager_api_v1_listen_port &&
  +	    have_api_port == 0) {
  +		have_api_port = 1;
  +		return 1; //keep this port
  +	} else {
  +		return 0;
  +	}
  +}
  +
  +static void
  +ngx_worker_set_worker_processes(ngx_cycle_t *cycle, ngx_int_t worker_processes)
  +{
  +
  +    ngx_core_conf_t  *ccf;
  +    ccf = (ngx_core_conf_t *) ngx_get_conf(cycle->conf_ctx,
  +                                           ngx_core_module);
  +    ccf->worker_processes = worker_processes;
  +}
  +static void
  +ngx_manager_process_cycle(ngx_cycle_t *cycle, void *data)
  +{
  +    ngx_int_t worker = (intptr_t) data;
  +
  +    ngx_process = NGX_PROCESS_HELPER;
  +    ngx_worker = worker;
  +
  +    ngx_close_listening_sockets(cycle, ngx_manager_except_listening_cb);
  +    /* adjudge worker_processes */
  +    ngx_worker_set_worker_processes(cycle, 1);
  +    ngx_worker_process_init(cycle, worker);
  +
  +    ngx_setproctitle("manager worker process");
  +
  +    for ( ;; ) {
  +
  +        if (ngx_exiting) {
  +            ngx_event_cancel_timers();
  +
  +            if (ngx_event_timer_rbtree.root == ngx_event_timer_rbtree.sentinel)
  +	    {
  +                ngx_log_error(NGX_LOG_NOTICE, cycle->log, 0, "exiting");
  +                ngx_worker_process_exit(cycle);
  +            }
  +        }
  +
  +        ngx_log_debug0(NGX_LOG_DEBUG_EVENT, cycle->log, 0, "manager worker cycle");
  +
  +        ngx_process_events_and_timers(cycle);
  +
  +        if (ngx_terminate) {
  +            ngx_log_error(NGX_LOG_NOTICE, cycle->log, 0, "exiting");
  +            ngx_worker_process_exit(cycle);
  +        }
  +
  +        if (ngx_quit) {
  +            ngx_quit = 0;
  +            ngx_log_error(NGX_LOG_NOTICE, cycle->log, 0,
  +                          "gracefully shutting down");
  +            ngx_setproctitle("manager worker process is shutting down");
  +
  +            if (!ngx_exiting) {
  +                ngx_exiting = 1;
  +                ngx_close_listening_sockets(cycle, NULL);
  +                ngx_close_idle_connections(cycle);
  +            }
  +        }
  +
  +        if (ngx_reopen) {
  +            ngx_reopen = 0;
  +            ngx_log_error(NGX_LOG_NOTICE, cycle->log, 0, "reopening logs");
  +            ngx_reopen_files(cycle, -1);
  +        }
  +    }
  +}

  +static void
  +ngx_start_api_manager_process(ngx_cycle_t *cycle, ngx_uint_t respawn)
  +{
  +    ngx_int_t      i = 0;
  +    ngx_channel_t  ch;
  +
  +    ngx_log_error(NGX_LOG_NOTICE, cycle->log, 0, "start api manager process");
  +
  +    ngx_memzero(&ch, sizeof(ngx_channel_t));
  +
  +    ch.command = NGX_CMD_OPEN_CHANNEL;
  +
  +
  +    ngx_spawn_process(cycle, ngx_manager_process_cycle,
  +		      (void *) (intptr_t) i,
  +		      "manager worker process",
  +                      respawn ? NGX_PROCESS_JUST_RESPAWN : NGX_PROCESS_RESPAWN);
  +
  +    ch.pid = ngx_processes[ngx_process_slot].pid;
  +    ch.slot = ngx_process_slot;
  +    ch.fd = ngx_processes[ngx_process_slot].channel[0];
  +
  +    ngx_pass_open_channel(cycle, &ch);
  +
  +}

   static void
   ngx_pass_open_channel(ngx_cycle_t *cycle, ngx_channel_t *ch)
  @@ -695,7 +816,7 @@
           }
       }

  -    ngx_close_listening_sockets(cycle);
  +    ngx_close_listening_sockets(cycle, NULL);

       /*
        * Copy ngx_cycle->log related data to the special static exit cycle,
  @@ -722,6 +843,14 @@
       exit(0);
   }

  +static char
  +ngx_worker_except_listening_cb(ngx_cycle_t *cycle, struct sockaddr *addr)
  +{
  +	if (addr && ngx_inet_get_port(addr) == ngx_http_manager_api_v1_listen_port)
  +		return 0; //close this port
  +	else
  +		return 1;
  +}

   static void
   ngx_worker_process_cycle(ngx_cycle_t *cycle, void *data)
  @@ -731,6 +860,7 @@
       ngx_process = NGX_PROCESS_WORKER;
       ngx_worker = worker;

  +    ngx_close_listening_sockets(cycle, ngx_worker_except_listening_cb);
       ngx_worker_process_init(cycle, worker);

       ngx_setproctitle("worker process");
  @@ -766,7 +896,7 @@

               if (!ngx_exiting) {
                   ngx_exiting = 1;
  -                ngx_close_listening_sockets(cycle);
  +                ngx_close_listening_sockets(cycle, NULL);
                   ngx_close_idle_connections(cycle);
               }
           }
  @@ -1106,7 +1236,7 @@
        */
       ngx_process = NGX_PROCESS_HELPER;

  -    ngx_close_listening_sockets(cycle);
  +    ngx_close_listening_sockets(cycle, NULL);

       /* Set a moderate number of connections for a helper process. */
       cycle->connection_n = 512;

  ```

* 功能配置
  nginx.conf
  ```
  http {
    ...
    #API Server
    manager_api_v1 on;
    manager_api_v1_listen_port 8087;
    manager_api_v1_config_path /path/to/
    ...
    server {
	    listen 8087 ;
	    location /api/v1 {

		    client_body_buffer_size 1M;
		    client_body_in_single_buffer on;
	    }
    }
    ...
  ```

* API模块
  API模块的主要功能是接收配置，按接口描述更新配置文件，并将配置同步给各工作进程。
  具体的流程图如下：
  ![流程图](/assets/update-flow.png "流程图")

* 与功能模块间的同步
  与模块间的同步要用到共享内存，要注意多进程下需要给配置加引用计数，API进程是生产者，WORKER进程为消费者。

## 其它
  无。
