---
layout: post
title:  "Packed与Aligned作用与差别"
date:   2018-11-23 15:55:45 +0800
categories: GCC
---
## Packed与Aligned作用与差别
### 什么是内存对齐
  由于操作系统中内存操作按字节访问，但CPU通过总线访问内存时需要按总线位数（字）访问，如32、64位等方式去访问，因此，如果操作内存时的地址不是按32、64位对齐的话，可能需要多次访问才可完成，这样对于性能影响较大。

### Packed
Packed是尽量压缩存储空间，主要用在文件存储与网络传输的二进制数据时使用。
```c
struct __attribute__ ((packed)) my_struct3 {
	char c;
	int  i;
};
```

### Aligned
Aligned是指示编译器要按几个字节对齐，主要是提高访问效率，但会增大存储空间。
```c
struct __attribute__ ((aligned (4))) my_struct2 {
	short f[3];
};
```
